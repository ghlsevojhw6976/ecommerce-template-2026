import { getPayload } from 'payload'
import config from '@payload-config'
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'
import fs from 'fs'
import path from 'path'

/**
 * One-off: GMC misrepresentation audit.
 *
 * Flags products where the TITLE contradicts the shortDescription/description
 * (or the structured color/size fields) on the two attributes Google's policy
 * team treats as classic misrepresentation signals: piece/pack COUNT and
 * COLOR. It does not auto-fix anything — it writes a JSON report for manual
 * review, cross-referenced against the original import CSV so a human (or a
 * follow-up script) can tell which value is actually correct.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gmcMisrepresentationAudit.ts
 */

const CSV_PATH = path.join(process.cwd(), 'imports/hot_products_rewritten.csv')
const OUT_PATH = path.join(process.cwd(), 'imports/gmc-audit-report.json')

// --- Minimal RFC4180 CSV parser (quoted fields, embedded commas/newlines/escaped quotes) ---
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

/** Access a column by name + occurrence (the CSV has `color`/`size`/`material` twice). */
const colIndices = (headers: string[], name: string): number[] =>
  headers.reduce<number[]>((acc, h, idx) => (h === name ? [...acc, idx] : acc), [])

// --- Heuristics -------------------------------------------------------------

const PIECE_UNIT_RE = /\b(\d+)\s*-?\s*(pieces?|pcs?|pack|packs|count|ct)\b/gi
const SET_OF_RE = /\bset of (\d+)\b/gi

const extractPieceCounts = (text: string): number[] => {
  const found = new Set<number>()
  for (const m of text.matchAll(PIECE_UNIT_RE)) found.add(Number(m[1]))
  for (const m of text.matchAll(SET_OF_RE)) found.add(Number(m[1]))
  return [...found]
}

const CAPACITY_UNIT_MAP: Record<string, string> = {
  quart: 'quart',
  quarts: 'quart',
  qt: 'quart',
  liter: 'liter',
  liters: 'liter',
  litre: 'liter',
  litres: 'liter',
  l: 'liter',
  gallon: 'gallon',
  gallons: 'gallon',
  gal: 'gallon',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  cup: 'cup',
  cups: 'cup',
  ml: 'ml',
}
const CAPACITY_RE = /\b(\d+(?:\.\d+)?)\s*-?\s*(quarts?|qt|liters?|litres?|l|gallons?|gal|oz|ounces?|cups?|ml)\b/gi

const extractCapacities = (text: string): string[] => {
  const found = new Set<string>()
  for (const m of text.matchAll(CAPACITY_RE)) {
    const unit = CAPACITY_UNIT_MAP[m[2].toLowerCase()]
    if (unit) found.add(`${Number(m[1])} ${unit}`)
  }
  return [...found]
}

const COLOR_CANON: Record<string, string> = {
  red: 'red',
  orange: 'orange',
  yellow: 'yellow',
  green: 'green',
  blue: 'blue',
  purple: 'purple',
  violet: 'purple',
  pink: 'pink',
  black: 'black',
  white: 'white',
  gray: 'gray',
  grey: 'gray',
  brown: 'brown',
  beige: 'beige',
  cream: 'cream',
  ivory: 'ivory',
  tan: 'tan',
  khaki: 'khaki',
  navy: 'navy',
  teal: 'teal',
  turquoise: 'turquoise',
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  copper: 'copper',
  rose: 'rose',
  maroon: 'maroon',
  burgundy: 'burgundy',
  charcoal: 'charcoal',
  graphite: 'graphite',
  slate: 'slate',
  mint: 'mint',
  coral: 'coral',
  lavender: 'lavender',
  olive: 'olive',
  mustard: 'mustard',
  rust: 'rust',
  plum: 'plum',
  magenta: 'magenta',
  cyan: 'cyan',
  indigo: 'indigo',
}
const COLOR_RE = new RegExp(`\\b(${Object.keys(COLOR_CANON).join('|')})\\b`, 'gi')

const extractColors = (text: string): string[] => {
  const found = new Set<string>()
  for (const m of text.matchAll(COLOR_RE)) found.add(COLOR_CANON[m[1].toLowerCase()])
  return [...found]
}

// --- Main --------------------------------------------------------------------

type Issue =
  | { type: 'piece-count-conflict'; titleCounts: number[]; descCounts: number[] }
  | { type: 'capacity-conflict'; titleCapacities: string[]; descCapacities: string[] }
  | { type: 'color-conflict-title-vs-desc'; titleColors: string[]; descColors: string[] }
  | { type: 'color-conflict-title-vs-field'; titleColors: string[]; colorField: string }
  | { type: 'csv-color-conflict'; dbColor: string; csvColor: string }
  | { type: 'csv-size-conflict'; dbSize: string; csvSize: string }

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })

  const csvText = fs.readFileSync(CSV_PATH, 'utf8')
  const { headers, rows } = parseCsv(csvText)
  const asinIdx = headers.indexOf('asin')
  const newTitleIdx = headers.indexOf('new_title')
  const colorIdxs = colIndices(headers, 'color') // [early, late]
  const sizeIdxs = colIndices(headers, 'size') // [late] (only one 'size' column)
  const capacityIdx = headers.indexOf('capacity')

  const csvByAsin = new Map<string, { row: string[] }>()
  for (const row of rows) {
    const asin = row[asinIdx]?.trim().toLowerCase()
    if (asin) csvByAsin.set(asin, { row })
  }

  console.log(`Loaded ${csvByAsin.size} CSV rows keyed by ASIN.`)

  const { docs } = await payload.find({
    collection: 'products',
    limit: 1000,
    depth: 0,
    where: { _status: { equals: 'published' } },
  })

  console.log(`Auditing ${docs.length} published products...`)

  const report: Record<string, unknown>[] = []

  for (const p of docs as any[]) {
    const title: string = p.title || ''
    const shortDescription: string = p.shortDescription || ''
    const descPlain: string = p.description
      ? convertLexicalToPlaintext({ data: p.description })
      : ''
    const bodyText = [shortDescription, descPlain].join(' ')

    const asinMatch = (p.slug || '').match(/-([a-z0-9]{10})$/i)
    const asin = asinMatch?.[1]?.toLowerCase()
    const csvEntry = asin ? csvByAsin.get(asin) : undefined
    const csvRow = csvEntry?.row

    const issues: Issue[] = []

    const titleCounts = extractPieceCounts(title)
    const descCounts = extractPieceCounts(bodyText)
    if (titleCounts.length && descCounts.length) {
      const overlap = titleCounts.some((c) => descCounts.includes(c))
      if (!overlap) issues.push({ type: 'piece-count-conflict', titleCounts, descCounts })
    }

    const titleCap = extractCapacities(title)
    const descCap = extractCapacities(bodyText)
    if (titleCap.length && descCap.length) {
      // Only flag same-unit, different-number conflicts (reduces false positives
      // from e.g. a product mentioning both its own capacity and an accessory's).
      const titleByUnit = new Map(titleCap.map((c) => [c.split(' ')[1], c]))
      const descByUnit = new Map(descCap.map((c) => [c.split(' ')[1], c]))
      const conflicting: string[] = []
      for (const [unit, val] of titleByUnit) {
        const descVal = descByUnit.get(unit)
        if (descVal && descVal !== val) conflicting.push(unit)
      }
      if (conflicting.length) {
        issues.push({ type: 'capacity-conflict', titleCapacities: titleCap, descCapacities: descCap })
      }
    }

    const titleColors = extractColors(title)
    const descColors = extractColors(bodyText)
    if (titleColors.length && descColors.length) {
      const overlap = titleColors.some((c) => descColors.includes(c))
      if (!overlap) issues.push({ type: 'color-conflict-title-vs-desc', titleColors, descColors })
    }

    if (p.color && titleColors.length) {
      const fieldCanon = COLOR_CANON[String(p.color).toLowerCase().trim()]
      const fieldMentioned =
        fieldCanon && titleColors.includes(fieldCanon)
          ? true
          : title.toLowerCase().includes(String(p.color).toLowerCase().trim())
      if (!fieldMentioned) {
        issues.push({
          type: 'color-conflict-title-vs-field',
          titleColors,
          colorField: String(p.color),
        })
      }
    }

    if (csvRow) {
      const csvColorLate = colorIdxs[1] !== undefined ? csvRow[colorIdxs[1]]?.trim() : ''
      const csvSize = sizeIdxs[0] !== undefined ? csvRow[sizeIdxs[0]]?.trim() : ''
      if (p.color && csvColorLate) {
        const dbCanon = COLOR_CANON[String(p.color).toLowerCase().trim()]
        const csvCanon = COLOR_CANON[csvColorLate.toLowerCase().trim()]
        if (dbCanon && csvCanon && dbCanon !== csvCanon) {
          issues.push({ type: 'csv-color-conflict', dbColor: String(p.color), csvColor: csvColorLate })
        }
      }
      if (p.size && csvSize && String(p.size).trim().toLowerCase() !== csvSize.toLowerCase()) {
        issues.push({ type: 'csv-size-conflict', dbSize: String(p.size), csvSize })
      }
    }

    if (issues.length) {
      report.push({
        id: p.id,
        slug: p.slug,
        title,
        shortDescription,
        descPlain: descPlain.slice(0, 500),
        color: p.color ?? null,
        size: p.size ?? null,
        itemGroupId: p.itemGroupId ?? null,
        csvNewTitle: csvRow && newTitleIdx >= 0 ? csvRow[newTitleIdx] : null,
        csvColorEarly: csvRow && colorIdxs[0] !== undefined ? csvRow[colorIdxs[0]] : null,
        csvColorLate: csvRow && colorIdxs[1] !== undefined ? csvRow[colorIdxs[1]] : null,
        csvSize: csvRow && sizeIdxs[0] !== undefined ? csvRow[sizeIdxs[0]] : null,
        csvCapacity: csvRow && capacityIdx >= 0 ? csvRow[capacityIdx] : null,
        issues,
      })
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`Flagged ${report.length} / ${docs.length} products. Report: ${OUT_PATH}`)
  process.exit(0)
}

run()
