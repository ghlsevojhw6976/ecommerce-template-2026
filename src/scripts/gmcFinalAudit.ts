import { getPayload } from 'payload'
import config from '@payload-config'
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'
import fs from 'fs'

/**
 * Final GMC misrepresentation sweep, on top of the two earlier audits.
 * Checks categories not yet covered:
 *
 *  1. Duplicate GTIN across DIFFERENT products (same GTIN should mean the
 *     same physical item — Google cross-merchant matches on it).
 *  2. Brand named in the title but absent from the `brand` field's word
 *     (or vice versa) — could indicate a wrong brand attribute.
 *  3. compareAtPriceInUSD not genuinely above priceInUSD (should be
 *     impossible — normalizeDiscount nulls these on write — verifying
 *     nothing bypassed it).
 *  4. Condition-contradicting words ("refurbished", "used", "open box",
 *     "pre-owned") appearing in description while `condition` says "new".
 *  5. Variant-family (itemGroupId) siblings sharing an IDENTICAL color+size
 *     pair — two "different" variants that aren't actually differentiated.
 *  6. Leftover color/capacity/piece-count conflicts (re-run of the earlier
 *     heuristics, to confirm the prior fixes left nothing behind and catch
 *     anything the earlier passes missed).
 *
 * Read-only — writes a report, changes nothing.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gmcFinalAudit.ts
 */

const PIECE_UNIT_RE = /\b(\d+)\s*-?\s*(pieces?|pcs?|pack|packs|count|ct)\b/gi
const SET_OF_RE = /\bset of (\d+)\b/gi
const extractPieceCounts = (text: string): number[] => {
  const found = new Set<number>()
  for (const m of text.matchAll(PIECE_UNIT_RE)) found.add(Number(m[1]))
  for (const m of text.matchAll(SET_OF_RE)) found.add(Number(m[1]))
  return [...found]
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

const CONDITION_WORDS = /\b(refurbished|used|open[\s-]?box|pre[\s-]?owned|second[\s-]?hand|renewed)\b/i

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'products',
    limit: 1000,
    depth: 0,
    where: { _status: { equals: 'published' } },
  })

  const findings: Record<string, unknown>[] = []

  // --- 1. Duplicate GTIN across different products ---
  const gtinMap = new Map<string, { id: number; title: string }[]>()
  for (const p of docs as any[]) {
    if (!p.gtin) continue
    const key = String(p.gtin).trim()
    if (!key) continue
    if (!gtinMap.has(key)) gtinMap.set(key, [])
    gtinMap.get(key)!.push({ id: p.id, title: p.title })
  }
  for (const [gtin, list] of gtinMap) {
    if (list.length > 1) {
      findings.push({ category: 'duplicate-gtin', gtin, products: list })
    }
  }

  // --- 5. itemGroupId siblings with identical color+size ---
  const familyMap = new Map<string, { id: number; title: string; color: string | null; size: string | null }[]>()
  for (const p of docs as any[]) {
    if (!p.itemGroupId) continue
    if (!familyMap.has(p.itemGroupId)) familyMap.set(p.itemGroupId, [])
    familyMap.get(p.itemGroupId)!.push({ id: p.id, title: p.title, color: p.color ?? null, size: p.size ?? null })
  }
  for (const [groupId, members] of familyMap) {
    if (members.length < 2) continue
    const seen = new Map<string, number[]>()
    for (const m of members) {
      const key = `${(m.color || '').toLowerCase().trim()}|${(m.size || '').toLowerCase().trim()}`
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key)!.push(m.id)
    }
    for (const [key, ids] of seen) {
      if (ids.length > 1 && key !== '|') {
        findings.push({
          category: 'family-siblings-identical-variant-attrs',
          itemGroupId: groupId,
          colorSize: key,
          productIds: ids,
          members,
        })
      }
    }
  }

  // --- Per-product checks: brand, price, condition, leftover contradictions ---
  for (const p of docs as any[]) {
    const title: string = p.title || ''
    const shortDescription: string = p.shortDescription || ''
    const descPlain: string = p.description ? convertLexicalToPlaintext({ data: p.description }) : ''
    const bodyText = [shortDescription, descPlain].join(' ')

    // --- 2. Brand named in title but not matching the brand field ---
    if (p.brand) {
      const brand = String(p.brand).trim()
      if (brand.length > 2 && !title.toLowerCase().includes(brand.toLowerCase())) {
        findings.push({
          category: 'brand-not-in-title',
          id: p.id,
          slug: p.slug,
          title,
          brand,
        })
      }
    }

    // --- 3. compareAt not genuinely above price ---
    if (
      typeof p.compareAtPriceInUSD === 'number' &&
      typeof p.priceInUSD === 'number' &&
      p.compareAtPriceInUSD <= p.priceInUSD
    ) {
      findings.push({
        category: 'compareAt-not-above-price',
        id: p.id,
        slug: p.slug,
        priceInUSD: p.priceInUSD,
        compareAtPriceInUSD: p.compareAtPriceInUSD,
      })
    }

    // --- 4. Condition contradiction ---
    if ((p.condition ?? 'new') === 'new') {
      const m = bodyText.match(CONDITION_WORDS)
      if (m) {
        findings.push({
          category: 'condition-contradiction',
          id: p.id,
          slug: p.slug,
          title,
          matchedWord: m[0],
          snippet: bodyText.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 60),
        })
      }
    }

    // --- 6a. Leftover piece-count conflicts ---
    const titleCounts = extractPieceCounts(title)
    const descCounts = extractPieceCounts(bodyText)
    if (titleCounts.length && descCounts.length) {
      const overlap = titleCounts.some((c) => descCounts.includes(c))
      if (!overlap) {
        findings.push({
          category: 'piece-count-conflict',
          id: p.id,
          slug: p.slug,
          title,
          titleCounts,
          descCounts,
        })
      }
    }

    // --- 6b. Leftover color conflicts (title vs description) ---
    const titleColors = extractColors(title)
    const descColors = extractColors(bodyText)
    if (titleColors.length && descColors.length) {
      const overlap = titleColors.some((c) => descColors.includes(c))
      if (!overlap) {
        findings.push({
          category: 'color-conflict-title-vs-desc',
          id: p.id,
          slug: p.slug,
          title,
          titleColors,
          descColors,
        })
      }
    }

    // --- 6c. Leftover color conflicts (title vs structured field) ---
    if (p.color && titleColors.length) {
      const fieldCanon = COLOR_CANON[String(p.color).toLowerCase().trim()]
      const fieldMentioned = fieldCanon
        ? titleColors.includes(fieldCanon)
        : title.toLowerCase().includes(String(p.color).toLowerCase().trim())
      if (!fieldMentioned) {
        findings.push({
          category: 'color-conflict-title-vs-field',
          id: p.id,
          slug: p.slug,
          title,
          titleColors,
          colorField: p.color,
        })
      }
    }

    // --- title still ending in a suspicious digit-suffixed color-like token ---
    const digitSuffixMatch = title.match(/\b([A-Za-z]{3,})(\d{1,3})\b(?=\s*[–-]|\s*$)/)
    if (digitSuffixMatch) {
      findings.push({
        category: 'title-digit-suffix-artifact',
        id: p.id,
        slug: p.slug,
        title,
        matched: digitSuffixMatch[0],
      })
    }
  }

  fs.writeFileSync('/tmp/gmc-final-audit.json', JSON.stringify(findings, null, 2))
  console.log(`Audited ${docs.length} products. ${findings.length} findings written to /tmp/gmc-final-audit.json`)
  const byCategory: Record<string, number> = {}
  for (const f of findings) {
    const c = (f as any).category
    byCategory[c] = (byCategory[c] || 0) + 1
  }
  console.log(JSON.stringify(byCategory, null, 2))
  process.exit(0)
}

run()
