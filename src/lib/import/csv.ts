import fs from 'fs'

/**
 * CSV reader for the product feed.
 *
 * Reads by **column index**, not by name. The source file contains duplicate
 * headers — `color` appears at indices 42 and 80, `material` at 41 and 82 — and
 * any name-keyed parser (including Node's csv-parse in object mode, or a naive
 * `Object.fromEntries`) silently keeps only the last occurrence. That quietly
 * discards half the attribute data.
 *
 * Hand-rolled rather than a dependency because the parsing rules are simple and
 * the failure mode above is the entire reason this file exists.
 */

export type CsvTable = {
  header: string[]
  rows: string[][]
  /** All indices for a header name, in file order. */
  indicesOf: (name: string) => number[]
}

/** RFC 4180: quoted fields, doubled quotes, embedded newlines and commas. */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  // Trailing field/row when the file does not end in a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

export const readCsv = (path: string): CsvTable => {
  const parsed = parseCsv(fs.readFileSync(path, 'utf8'))
  const [header = [], ...rows] = parsed

  return {
    header,
    // Skip blank trailing lines.
    rows: rows.filter((r) => r.some((cell) => cell.trim())),
    indicesOf: (name) => header.map((h, i) => (h === name ? i : -1)).filter((i) => i !== -1),
  }
}

/**
 * Accessor bound to one row.
 *
 * `occurrence` selects which duplicate column to read — 0 is the first. The
 * source file's two `color` columns hold different data (the second is the
 * normalised variant value), so both are useful.
 */
export const cell = (
  table: CsvTable,
  row: string[],
  name: string,
  occurrence = 0,
): string => {
  const index = table.indicesOf(name)[occurrence]
  if (index === undefined) return ''
  return (row[index] ?? '').trim()
}

export const numberCell = (
  table: CsvTable,
  row: string[],
  name: string,
  occurrence = 0,
): number | null => {
  const raw = cell(table, row, name, occurrence).replace(/[$,%\s]/g, '')
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export const jsonCell = <T,>(
  table: CsvTable,
  row: string[],
  name: string,
  fallback: T,
): T => {
  const raw = cell(table, row, name)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
