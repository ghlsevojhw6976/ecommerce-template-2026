import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'
import path from 'path'

/**
 * Pre-GMC-launch GTIN/UPC audit. Checks what's programmatically verifiable:
 *
 *  1. Presence — every feed-eligible product has a value.
 *  2. Format — 8, 12, 13 or 14 digits (GTIN-8 / UPC-12 / EAN-13 / GTIN-14),
 *     numeric only.
 *  3. GS1 check-digit validity — the standard mod-10 checksum used by every
 *     GTIN length. Catches transcription errors, truncation, and padding
 *     mistakes that a length check alone would miss.
 *  4. Duplicates — the same GTIN on two different products (Google treats
 *     identical GTINs as the same physical item; a real duplicate is either
 *     a data error or a genuine reissue that needs a decision).
 *  5. Fidelity to the original import — confirms the DB value still matches
 *     the CSV's own `gtin` column for that ASIN, i.e. nothing drifted
 *     during any of this week's edits (none of them should have touched
 *     GTIN, but this proves it rather than assumes it).
 *
 * What this CANNOT verify: that a well-formed, correctly-checksummed GTIN
 * is the ACTUAL barcode for that physical SKU (vs. a valid-looking but
 * wrong one, or a real GTIN from a different variant/pack size). That needs
 * either a live GS1/barcode database lookup (not available here) or
 * Google's own Merchant Center matching after real submission — Merchant
 * Center will flag "GTIN does not match this product" post-submission if
 * it's wrong. This script narrows the risk, it doesn't eliminate it.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gtinAudit.ts
 */

const CSV_PATH = path.join(process.cwd(), 'imports/hot_products_rewritten.csv')

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [headers, ...dataRows] = rows
  return { headers, rows: dataRows }
}

const FORMAT_RE = /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/

/** Standard GS1 mod-10 check digit, works uniformly for GTIN-8/12/13/14. */
const hasValidChecksum = (code: string): boolean => {
  const digits = code.split('').map(Number)
  const checkDigit = digits.pop()!
  let sum = 0
  digits
    .slice()
    .reverse()
    .forEach((d, i) => {
      sum += d * (i % 2 === 0 ? 3 : 1)
    })
  const calculated = (10 - (sum % 10)) % 10
  return calculated === checkDigit
}

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })

  const hasCsv = fs.existsSync(CSV_PATH)
  const csvByAsin = new Map<string, string>() // asin -> csv gtin
  if (hasCsv) {
    const { headers, rows } = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'))
    const asinIdx = headers.indexOf('asin')
    const gtinIdx = headers.indexOf('gtin')
    for (const row of rows) {
      const asin = row[asinIdx]?.trim().toLowerCase()
      if (asin) csvByAsin.set(asin, row[gtinIdx]?.trim() ?? '')
    }
    console.log(`Loaded ${csvByAsin.size} CSV rows for fidelity cross-check.`)
  } else {
    console.log('CSV not found at', CSV_PATH, '— skipping fidelity cross-check.')
  }

  const { docs } = await payload.find({
    collection: 'products',
    limit: 1000,
    depth: 0,
    where: { _status: { equals: 'published' } },
  })

  const issues: Record<string, unknown>[] = []
  const gtinToProducts = new Map<string, { id: number; slug: string }[]>()
  let missing = 0
  let formatBad = 0
  let checksumBad = 0
  let driftedFromCsv = 0

  for (const p of docs as any[]) {
    const gtin = (p.gtin ?? '').toString().trim()

    if (!gtin) {
      missing++
      issues.push({ category: 'missing', id: p.id, slug: p.slug })
      continue
    }

    if (!FORMAT_RE.test(gtin)) {
      formatBad++
      issues.push({ category: 'bad-format', id: p.id, slug: p.slug, gtin })
    } else if (!hasValidChecksum(gtin)) {
      checksumBad++
      issues.push({ category: 'bad-checksum', id: p.id, slug: p.slug, gtin })
    }

    if (!gtinToProducts.has(gtin)) gtinToProducts.set(gtin, [])
    gtinToProducts.get(gtin)!.push({ id: p.id, slug: p.slug })

    if (hasCsv) {
      const asinMatch = (p.slug || '').match(/-([a-z0-9]{10})$/i)
      const asin = asinMatch?.[1]?.toLowerCase()
      const csvGtin = asin ? csvByAsin.get(asin) : undefined
      if (csvGtin !== undefined && csvGtin !== '' && csvGtin !== gtin) {
        driftedFromCsv++
        issues.push({ category: 'drifted-from-csv-source', id: p.id, slug: p.slug, dbGtin: gtin, csvGtin })
      }
    }
  }

  const duplicates = [...gtinToProducts.entries()].filter(([, list]) => list.length > 1)
  for (const [gtin, list] of duplicates) {
    issues.push({ category: 'duplicate-gtin', gtin, products: list })
  }

  fs.writeFileSync('/tmp/gtin-audit.json', JSON.stringify(issues, null, 2))

  console.log('\n=== GTIN Audit Summary ===')
  console.log('Total published products:', docs.length)
  console.log('Missing GTIN:', missing)
  console.log('Bad format (not 8/12/13/14 digits):', formatBad)
  console.log('Bad GS1 checksum:', checksumBad)
  console.log('Duplicate GTINs (across different products):', duplicates.length)
  if (hasCsv) console.log('Drifted from original CSV source:', driftedFromCsv)
  console.log('\nFull detail: /tmp/gtin-audit.json')
  process.exit(0)
}

run()
