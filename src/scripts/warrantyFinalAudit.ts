import { getPayload } from 'payload'
import config from '@payload-config'
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'
import fs from 'fs'

/**
 * Final sweep for "warranty" / "lifetime" across every customer-facing
 * surface: product fields (title, shortDescription, description, color,
 * size, meta), pages (all published Pages docs, richText content), and
 * review body/title (flagged, never auto-edited — genuine customer text).
 *
 *   pnpm exec tsx --env-file=.env src/scripts/warrantyFinalAudit.ts
 */

const RE = /\b(warrant(?:y|ies)|lifetime)\b/i

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const findings: Record<string, unknown>[] = []

  // --- Products ---
  const { docs: products } = await payload.find({
    collection: 'products',
    limit: 1000,
    depth: 0,
    where: { _status: { equals: 'published' } },
  })

  for (const p of products as any[]) {
    const descPlain = p.description ? convertLexicalToPlaintext({ data: p.description }) : ''
    const fields: [string, string | null | undefined][] = [
      ['title', p.title],
      ['shortDescription', p.shortDescription],
      ['description', descPlain],
      ['color', p.color],
      ['size', p.size],
      ['metaDescription', p.meta?.description],
      ['metaTitle', p.meta?.title],
    ]
    for (const [field, value] of fields) {
      if (typeof value === 'string' && RE.test(value)) {
        findings.push({
          type: 'product',
          id: p.id,
          slug: p.slug,
          field,
          match: value.match(RE)?.[0],
          snippet: value.slice(Math.max(0, (value.search(RE) ?? 0) - 40), (value.search(RE) ?? 0) + 60),
        })
      }
    }
  }

  // --- Pages ---
  const { docs: pages } = await payload.find({
    collection: 'pages',
    limit: 200,
    depth: 0,
    where: { _status: { equals: 'published' } },
  })

  for (const pg of pages as any[]) {
    const layoutText = JSON.stringify(pg.layout ?? '')
    // Extract just lexical "text" values for a readable check, not the raw JSON.
    const texts: string[] = []
    const walk = (node: any) => {
      if (node && typeof node === 'object') {
        if (typeof node.text === 'string') texts.push(node.text)
        if (Array.isArray(node.children)) node.children.forEach(walk)
        for (const key of Object.keys(node)) {
          if (key !== 'children' && node[key] && typeof node[key] === 'object') walk(node[key])
        }
      } else if (Array.isArray(node)) {
        node.forEach(walk)
      }
    }
    walk(pg.layout)
    const combined = texts.join(' ')
    if (RE.test(combined)) {
      const matches = [...combined.matchAll(new RegExp(RE.source, 'gi'))]
      findings.push({
        type: 'page',
        slug: pg.slug,
        matchCount: matches.length,
        snippets: texts.filter((t) => RE.test(t)),
      })
    }
    void layoutText
  }

  // --- Reviews (flagged only, never auto-edited) ---
  const { docs: reviews } = await payload.find({
    collection: 'reviews',
    limit: 1,
    depth: 0,
    where: {
      or: [{ body: { like: 'warranty' } }, { body: { like: 'lifetime' } }],
    },
  })
  const { totalDocs: reviewMatchCount } = await payload.find({
    collection: 'reviews',
    limit: 0,
    depth: 0,
    where: {
      or: [{ body: { like: 'warranty' } }, { body: { like: 'lifetime' } }],
    },
  })
  void reviews

  fs.writeFileSync('/tmp/warranty-final-audit.json', JSON.stringify(findings, null, 2))
  console.log(`Product/page findings: ${findings.length} — see /tmp/warranty-final-audit.json`)
  console.log(`Review bodies mentioning warranty/lifetime (NOT touched, flagged only): ${reviewMatchCount}`)
  process.exit(0)
}

run()
