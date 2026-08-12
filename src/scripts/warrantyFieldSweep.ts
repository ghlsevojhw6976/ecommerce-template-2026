import { getPayload } from 'payload'
import config from '@payload-config'
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'
import fs from 'fs'

/**
 * Exhaustive field-by-field sweep for "warranty" (case-insensitive) across
 * EVERY field on every product — not just description/shortDescription,
 * which the 2026-08-12 pass covered. Requested after that pass missed the
 * `specifications` array (attributes_json -> spec rows, rendered verbatim
 * in Specifications.tsx as the PDP "Details" table).
 *
 * Read-only. Reports distinct field names with match counts + samples.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/warrantyFieldSweep.ts
 */

const RE = /warranty/i

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'products',
    limit: 1000,
    depth: 0,
    where: { _status: { equals: 'published' } },
  })

  const byField: Record<string, { count: number; samples: { id: number; slug: string; value: string }[] }> = {}

  const record = (field: string, id: number, slug: string, value: string) => {
    if (!byField[field]) byField[field] = { count: 0, samples: [] }
    byField[field].count++
    if (byField[field].samples.length < 5) byField[field].samples.push({ id, slug, value })
  }

  for (const p of docs as any[]) {
    const id = p.id
    const slug = p.slug

    const scalarFields: [string, string | null | undefined][] = [
      ['title', p.title],
      ['shortDescription', p.shortDescription],
      ['color', p.color],
      ['size', p.size],
      ['brand', p.brand],
      ['mpn', p.mpn],
      ['gtin', p.gtin],
      ['careInstructions', p.careInstructions],
      ['meta.title', p.meta?.title],
      ['meta.description', p.meta?.description],
      ['unitPricingMeasure', p.unitPricingMeasure],
      ['unitPricingBaseMeasure', p.unitPricingBaseMeasure],
      ['feedExclusionReason', p.feedExclusionReason],
      ['variantLabel', p.variantLabel],
    ]
    for (const [field, value] of scalarFields) {
      if (typeof value === 'string' && RE.test(value)) record(field, id, slug, value)
    }

    if (p.description) {
      const plain = convertLexicalToPlaintext({ data: p.description })
      if (RE.test(plain)) record('description (richText)', id, slug, plain)
    }

    for (const spec of p.specifications ?? []) {
      if (typeof spec?.label === 'string' && RE.test(spec.label)) {
        record('specifications[].label', id, slug, `${spec.label}: ${spec.value}`)
      } else if (typeof spec?.value === 'string' && RE.test(spec.value)) {
        record('specifications[].value', id, slug, `${spec.label}: ${spec.value}`)
      }
    }

    for (const f of p.keyFeatures ?? []) {
      if (typeof f?.feature === 'string' && RE.test(f.feature)) record('keyFeatures[].feature', id, slug, f.feature)
      if (typeof f?.detail === 'string' && RE.test(f.detail)) record('keyFeatures[].detail', id, slug, f.detail)
    }

    for (const item of p.inTheBox ?? []) {
      if (typeof item?.item === 'string' && RE.test(item.item)) record('inTheBox[].item', id, slug, item.item)
    }
  }

  // Reviews — flagged only.
  const { totalDocs: reviewBodyCount } = await payload.find({
    collection: 'reviews',
    limit: 0,
    depth: 0,
    where: { body: { like: 'warranty' } },
  })
  const { totalDocs: reviewTitleCount } = await payload.find({
    collection: 'reviews',
    limit: 0,
    depth: 0,
    where: { title: { like: 'warranty' } },
  })

  const report = {
    products: byField,
    reviews: { bodyMatches: reviewBodyCount, titleMatches: reviewTitleCount },
  }

  fs.writeFileSync('/tmp/warranty-field-sweep.json', JSON.stringify(report, null, 2))
  console.log('Fields with matches:')
  for (const [field, data] of Object.entries(byField)) {
    console.log(`  ${field}: ${data.count} matches`)
  }
  console.log(`Reviews — body: ${reviewBodyCount}, title: ${reviewTitleCount} (flagged, not scanned per-field further)`)
  process.exit(0)
}

run()
