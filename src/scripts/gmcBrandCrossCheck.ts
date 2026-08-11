import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'
import path from 'path'

/**
 * Cross-check every product's `brand` field against its OWN row in the
 * original import CSV. A mismatch here means the brand was corrupted at
 * import (didn't even match its own source data) — the CSV's `brand`
 * column is ground truth. Read-only, writes a report.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gmcBrandCrossCheck.ts
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

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })

  const csvText = fs.readFileSync(CSV_PATH, 'utf8')
  const { headers, rows } = parseCsv(csvText)
  const asinIdx = headers.indexOf('asin')
  const brandIdx = headers.indexOf('brand')
  const titleIdx = headers.indexOf('title')

  const csvByAsin = new Map<string, string[]>()
  for (const row of rows) {
    const asin = row[asinIdx]?.trim().toLowerCase()
    if (asin) csvByAsin.set(asin, row)
  }

  const { docs } = await payload.find({
    collection: 'products',
    limit: 1000,
    depth: 0,
    where: { _status: { equals: 'published' } },
  })

  const results: Record<string, unknown>[] = []

  for (const p of docs as any[]) {
    if (!p.brand) continue
    const asinMatch = (p.slug || '').match(/-([a-z0-9]{10})$/i)
    const asin = asinMatch?.[1]?.toLowerCase()
    const csvRow = asin ? csvByAsin.get(asin) : undefined
    if (!csvRow) {
      results.push({ id: p.id, slug: p.slug, dbBrand: p.brand, status: 'NO CSV ROW FOUND' })
      continue
    }
    const csvBrand = csvRow[brandIdx]?.trim()
    const csvTitle = csvRow[titleIdx]?.trim()
    const match = csvBrand && csvBrand.toLowerCase() === String(p.brand).trim().toLowerCase()
    results.push({
      id: p.id,
      slug: p.slug,
      dbBrand: p.brand,
      dbTitle: p.title,
      csvBrand,
      csvTitle,
      match,
    })
  }

  fs.writeFileSync('/tmp/gmc-brand-crosscheck.json', JSON.stringify(results, null, 2))
  const mismatches = results.filter((r: any) => r.match === false)
  console.log(`${results.length} products with a brand field. ${mismatches.length} do NOT match their own CSV row's brand column.`)
  process.exit(0)
}

run()
