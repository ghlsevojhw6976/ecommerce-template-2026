import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'
import path from 'path'

/**
 * Fix the 50 product titles truncated mid-word by a hard 70-char cap on the
 * base-name segment in the original import pipeline (found during the
 * 2026-08-11 GMC audit, deliberately left unfixed at the time because a
 * naive full-title restore risks reintroducing a color contradiction — some
 * raw Amazon titles end in their own "- Black" style suffix that may
 * disagree with the `color` field this catalogue already spent a full audit
 * pass getting correct).
 *
 * Approach: take the CSV's own un-truncated `title` column (the base name
 * only) and prepend it to the EXISTING title's suffix (everything from the
 * first " – " onward — size/color/category — which was never touched by the
 * truncation bug and is already verified correct). Before using the raw
 * title, strip a trailing " - <word(s)>" / ", <word(s)>" tail ONLY if it
 * names a color that conflicts with this product's own (already-verified)
 * `color` field — leaves it alone otherwise (e.g. a trailing brand name or
 * spec that doesn't contradict anything).
 *
 * DRY_RUN=1 pnpm exec tsx --env-file=.env src/scripts/gmcFixTruncatedTitles.ts
 *           pnpm exec tsx --env-file=.env src/scripts/gmcFixTruncatedTitles.ts
 */

const CSV_PATH = '/tmp/hot_products_rewritten.csv'
const MAX_TITLE_LEN = 180

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

const COLOR_CANON: Record<string, string> = {
  red: 'red', orange: 'orange', yellow: 'yellow', green: 'green', blue: 'blue',
  purple: 'purple', violet: 'purple', pink: 'pink', black: 'black', white: 'white',
  gray: 'gray', grey: 'gray', brown: 'brown', beige: 'beige', cream: 'cream',
  ivory: 'ivory', tan: 'tan', khaki: 'khaki', navy: 'navy', teal: 'teal',
  turquoise: 'turquoise', gold: 'gold', silver: 'silver', bronze: 'bronze',
  copper: 'copper', rose: 'rose', maroon: 'maroon', burgundy: 'burgundy',
  charcoal: 'charcoal', graphite: 'graphite', slate: 'slate', mint: 'mint',
  coral: 'coral', lavender: 'lavender', olive: 'olive', mustard: 'mustard',
  rust: 'rust', plum: 'plum', magenta: 'magenta', cyan: 'cyan', indigo: 'indigo',
}
const COLOR_RE = new RegExp(`\\b(${Object.keys(COLOR_CANON).join('|')})\\b`, 'gi')
const extractColors = (text: string): string[] => {
  const found = new Set<string>()
  for (const m of text.matchAll(COLOR_RE)) found.add(COLOR_CANON[m[1].toLowerCase()])
  return [...found]
}

/** Strip a trailing " - X" / ", X" tail if it names a color that conflicts with `knownColor`. */
const stripConflictingColorTail = (rawTitle: string, knownColor: string | null): string => {
  if (!knownColor) return rawTitle
  const knownColors = extractColors(knownColor)
  if (!knownColors.length) return rawTitle

  const m = rawTitle.match(/^(.*?)[\s]*[-,]\s*([A-Za-z][A-Za-z\s]{2,24})$/)
  if (!m) return rawTitle
  const [, head, tail] = m
  const tailColors = extractColors(tail)
  if (!tailColors.length) return rawTitle
  const conflicts = tailColors.some((c) => !knownColors.includes(c))
  if (!conflicts) return rawTitle
  return head.trim()
}

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const dryRun = process.env.DRY_RUN === '1'

  const csvText = fs.readFileSync(CSV_PATH, 'utf8')
  const { headers, rows } = parseCsv(csvText)
  const asinIdx = headers.indexOf('asin')
  const newTitleIdx = headers.indexOf('new_title')
  const titleIdx = headers.indexOf('title')

  const truncatedByAsin = new Map<string, string>() // asin -> raw CSV title
  for (const row of rows) {
    const nt = row[newTitleIdx]
    const base = nt.split(' – ')[0]
    if (base.length === 70) {
      truncatedByAsin.set(row[asinIdx].trim().toLowerCase(), row[titleIdx])
    }
  }
  console.log(`${truncatedByAsin.size} truncated ASINs found in CSV.`)

  const { docs } = await payload.find({
    collection: 'products',
    limit: 1000,
    depth: 0,
    where: { _status: { equals: 'published' } },
  })

  const results: Record<string, unknown>[] = []

  for (const p of docs as any[]) {
    const asinMatch = (p.slug || '').match(/-([a-z0-9]{10})$/i)
    const asin = asinMatch?.[1]?.toLowerCase()
    if (!asin) continue
    const rawTitle = truncatedByAsin.get(asin)
    if (!rawTitle) continue

    const currentTitle: string = p.title || ''
    const dashIdx = currentTitle.indexOf(' – ')
    const suffix = dashIdx >= 0 ? currentTitle.slice(dashIdx) : ''

    // The raw CSV title itself is sometimes already cut off mid-list (a
    // source-data limitation, independent of our own truncation bug) and
    // ends in a dangling connector/punctuation — clean that unconditionally,
    // not only when the length cap below also has to trim.
    const cleanedBase = stripConflictingColorTail(rawTitle.trim(), p.color ?? null).replace(
      /[\s,;:&-]+$/,
      '',
    )
    let newTitle = `${cleanedBase}${suffix}`

    if (newTitle.length > MAX_TITLE_LEN) {
      const budget = MAX_TITLE_LEN - suffix.length
      const trimmed = cleanedBase
        .slice(0, Math.max(0, budget))
        .replace(/\s+\S*$/, '') // drop a partial trailing word
        .replace(/[\s,;:&-]+$/, '') // then any dangling connector/punctuation
      newTitle = `${trimmed}${suffix}`
    }

    if (newTitle === currentTitle) {
      results.push({ id: p.id, status: 'SKIPPED — already matches', title: currentTitle })
      continue
    }

    if (!dryRun) {
      await payload.update({
        collection: 'products',
        id: p.id,
        data: { title: newTitle } as never,
      })
    }

    results.push({
      id: p.id,
      status: dryRun ? 'WOULD APPLY' : 'APPLIED',
      color: p.color ?? null,
      oldTitle: currentTitle,
      newTitle,
      strippedColorTail: cleanedBase !== rawTitle.trim(),
    })
  }

  fs.writeFileSync('/tmp/gmc-title-fix-results.json', JSON.stringify(results, null, 2))
  const applied = results.filter((r: any) => r.status === 'APPLIED' || r.status === 'WOULD APPLY').length
  console.log(`${dryRun ? 'Would apply' : 'Applied'} ${applied} / ${results.length}.`)
  process.exit(0)
}

run()
