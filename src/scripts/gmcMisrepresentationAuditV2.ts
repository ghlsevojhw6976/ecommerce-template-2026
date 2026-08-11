import { getPayload } from 'payload'
import config from '@payload-config'
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'
import fs from 'fs'
import path from 'path'

/**
 * GMC misrepresentation audit v2 — broader pass on top of v1.
 *
 * v1 only flagged a title-vs-field conflict when the title happened to
 * contain a recognized simple color word. This pass additionally catches:
 *  - color/size fields that are clearly NOT the attribute they claim to be
 *    (marketing copy or warranty text that bled in at import when a title
 *    had more dash-segments than the importer expected)
 *  - the exact same size/color STRING shared by two unrelated products
 *    (cross-contamination between rows)
 *  - container-quantity words (bottles/cans/burners/zones) disagreeing
 *    between the title and the structured size field
 *
 * Read-only. Writes a JSON report; nothing is changed here.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gmcMisrepresentationAuditV2.ts
 */

const OUT_PATH = path.join(process.cwd(), 'imports/gmc-audit-report-v2.json')

const GARBAGE_COLOR_RE =
  /\b(warranty|included|power level|preset|handle pull|zone|dishwasher|manual|instructions?)\b/i

const COLOR_WORDS = [
  'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'violet', 'pink', 'black', 'white',
  'gray', 'grey', 'brown', 'beige', 'cream', 'ivory', 'tan', 'khaki', 'navy', 'teal',
  'turquoise', 'gold', 'silver', 'bronze', 'copper', 'rose', 'maroon', 'burgundy', 'charcoal',
  'graphite', 'slate', 'mint', 'coral', 'lavender', 'olive', 'mustard', 'rust', 'plum',
  'magenta', 'cyan', 'indigo', 'agave', 'sage', 'stainless', 'porcelain', 'matte',
]
const containsAnyColorWord = (s: string): boolean => {
  const lower = s.toLowerCase()
  return COLOR_WORDS.some((w) => lower.includes(w))
}

const CONTAINER_RE = /\b(\d+)\s*-?\s*(bottles?|cans?|zones?|burners?|drawers?)\b/gi
const extractContainers = (text: string): Map<string, number> => {
  const map = new Map<string, number>()
  for (const m of text.matchAll(CONTAINER_RE)) {
    let unit = m[2].toLowerCase()
    if (unit.endsWith('s') && unit !== 'zones' /* keep 'zones' plural distinct is fine */)
      unit = unit
    map.set(unit.replace(/s$/, ''), Number(m[1]))
  }
  return map
}

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'products',
    limit: 1000,
    depth: 0,
    where: { _status: { equals: 'published' } },
  })

  console.log(`Auditing ${docs.length} published products (v2 broad pass)...`)

  // Build value -> [{id, title}] maps for duplicate-detection
  const colorValueMap = new Map<string, { id: number; title: string }[]>()
  const sizeValueMap = new Map<string, { id: number; title: string }[]>()

  const productData: {
    id: number
    slug: string
    title: string
    shortDescription: string
    descPlain: string
    color: string | null
    size: string | null
  }[] = []

  for (const p of docs as any[]) {
    const title: string = p.title || ''
    const shortDescription: string = p.shortDescription || ''
    const descPlain: string = p.description
      ? convertLexicalToPlaintext({ data: p.description })
      : ''
    const color: string | null = p.color || null
    const size: string | null = p.size || null

    productData.push({ id: p.id, slug: p.slug, title, shortDescription, descPlain, color, size })

    if (color) {
      const key = color.trim().toLowerCase()
      if (!colorValueMap.has(key)) colorValueMap.set(key, [])
      colorValueMap.get(key)!.push({ id: p.id, title })
    }
    if (size) {
      const key = size.trim().toLowerCase()
      if (!sizeValueMap.has(key)) sizeValueMap.set(key, [])
      sizeValueMap.get(key)!.push({ id: p.id, title })
    }
  }

  const titleFirstWord = (t: string): string => (t.split(/\s+/)[0] || '').toLowerCase()

  const report: Record<string, unknown>[] = []

  for (const p of productData) {
    const issues: Record<string, unknown>[] = []

    // Garbage color field: contains marketing/warranty leakage OR (long AND no color/material word)
    if (p.color) {
      const looksGarbage =
        GARBAGE_COLOR_RE.test(p.color) || (p.color.length > 25 && !containsAnyColorWord(p.color))
      if (looksGarbage) {
        issues.push({ type: 'color-field-garbage', color: p.color })
      }
    }

    // Duplicate color value shared with an unrelated product (different first word / brand).
    // Only meaningful for long/specific values — many unrelated products are
    // legitimately both "Black" or "Stainless Steel", that's not contamination.
    if (p.color && p.color.trim().length > 20) {
      const key = p.color.trim().toLowerCase()
      const sharers = colorValueMap.get(key) || []
      const unrelated = sharers.filter(
        (s) => s.id !== p.id && titleFirstWord(s.title) !== titleFirstWord(p.title),
      )
      if (unrelated.length) {
        issues.push({
          type: 'color-value-shared-with-unrelated-product',
          color: p.color,
          sharedWith: unrelated.map((u) => ({ id: u.id, title: u.title })),
        })
      }
    }

    // Duplicate size value shared with an unrelated product
    if (p.size && p.size.trim().length > 20) {
      const key = p.size.trim().toLowerCase()
      const sharers = sizeValueMap.get(key) || []
      const unrelated = sharers.filter(
        (s) => s.id !== p.id && titleFirstWord(s.title) !== titleFirstWord(p.title),
      )
      if (unrelated.length) {
        issues.push({
          type: 'size-value-shared-with-unrelated-product',
          size: p.size,
          sharedWith: unrelated.map((u) => ({ id: u.id, title: u.title })),
        })
      }
    }

    // Container-quantity conflicts: title vs structured size field
    if (p.size) {
      const titleContainers = extractContainers(p.title)
      const sizeContainers = extractContainers(p.size)
      for (const [unit, titleN] of titleContainers) {
        const sizeN = sizeContainers.get(unit)
        if (sizeN !== undefined && sizeN !== titleN) {
          issues.push({
            type: 'container-quantity-conflict',
            unit,
            titleValue: titleN,
            sizeValue: sizeN,
          })
        }
      }
    }

    if (issues.length) {
      report.push({
        id: p.id,
        slug: p.slug,
        title: p.title,
        shortDescription: p.shortDescription,
        descPlain: p.descPlain.slice(0, 300),
        color: p.color,
        size: p.size,
        issues,
      })
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`Flagged ${report.length} / ${docs.length} products (v2). Report: ${OUT_PATH}`)
  process.exit(0)
}

run()
