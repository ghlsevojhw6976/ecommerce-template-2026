import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'

/**
 * Strip manufacturer-warranty language from product descriptions — owner
 * decision 2026-08-12: 40tag is not an authorized retailer for the brands
 * it sells (All-Clad, KitchenAid, Blackstone, etc.) and cannot promise their
 * manufacturer warranties will be honored. All warranty/guarantee language
 * is being consolidated into one store-backed claim (the 40tag 24-Month
 * Guarantee, added separately in the UI/Terms/FAQ) — none of it belongs in
 * auto-generated product copy.
 *
 * Exact-match guarded per field, same pattern as the GMC audit fixes. Two
 * products (587, 575) were found during the audit to contain "lifetime" as
 * a customer-feedback-theme keyword ("beautiful, lifetime") rather than a
 * warranty claim — deliberately NOT included here; flagged for manual
 * review instead of guessed at.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/stripWarrantyClauses.ts
 */

type Fix = { id: number; field: 'shortDescription' | 'description'; from: string; to: string }

const FIXES: Fix[] = [
  {
    id: 503,
    field: 'shortDescription',
    from: 'In the box: beverage center, manual, warranty.',
    to: 'In the box: beverage center, manual.',
  },
  {
    id: 503,
    field: 'description',
    from: 'In the box: beverage center, manual, warranty.',
    to: 'In the box: beverage center, manual.',
  },
  {
    id: 576,
    field: 'shortDescription',
    from: '4.25 qt. saute pan w/lid. Backed by limited lifetime warranty.',
    to: '4.25 qt. saute pan w/lid.',
  },
  {
    id: 576,
    field: 'description',
    from: '4.25 qt. saute pan w/lid. Backed by limited lifetime warranty.',
    to: '4.25 qt. saute pan w/lid.',
  },
  {
    id: 593,
    field: 'shortDescription',
    from: 'Care: hand wash only. backed by lifetime warranty.',
    to: 'Care: hand wash only.',
  },
  {
    id: 593,
    field: 'description',
    from: 'Care: hand wash only. backed by lifetime warranty.',
    to: 'Care: hand wash only.',
  },
  {
    id: 626,
    field: 'shortDescription',
    from: 'In the box: 1 8-quart stock pot with lid. Backed by limited lifetime warranty.',
    to: 'In the box: 1 8-quart stock pot with lid.',
  },
  {
    id: 626,
    field: 'description',
    from: 'In the box: 1 8-quart stock pot with lid. Backed by limited lifetime warranty.',
    to: 'In the box: 1 8-quart stock pot with lid.',
  },
  {
    id: 619,
    field: 'shortDescription',
    from: 'Recurring themes in customer feedback: easy, perfect, cooking, cleanup. Backed by lifetime warranty.',
    to: 'Recurring themes in customer feedback: easy, perfect, cooking, cleanup.',
  },
  {
    id: 619,
    field: 'description',
    from: 'Recurring themes in customer feedback: easy, perfect, cooking, cleanup. Backed by lifetime warranty.',
    to: 'Recurring themes in customer feedback: easy, perfect, cooking, cleanup.',
  },
]

const replaceInLexical = (node: any, from: string, to: string): boolean => {
  let changed = false
  if (node && typeof node === 'object') {
    if (typeof node.text === 'string' && node.text.includes(from)) {
      node.text = node.text.split(from).join(to)
      changed = true
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (replaceInLexical(child, from, to)) changed = true
      }
    }
    if (node.root) {
      if (replaceInLexical(node.root, from, to)) changed = true
    }
  }
  return changed
}

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const results: Record<string, unknown>[] = []
  const affectedProductIds = new Set<number>()

  for (const fix of FIXES) {
    const p: any = await payload.findByID({ collection: 'products', id: fix.id, depth: 0 })

    if (fix.field === 'description') {
      if (!p.description) {
        results.push({ id: fix.id, field: fix.field, status: 'SKIPPED — no description' })
        continue
      }
      const descCopy = JSON.parse(JSON.stringify(p.description))
      if (!replaceInLexical(descCopy, fix.from, fix.to)) {
        results.push({
          id: fix.id,
          field: fix.field,
          status: 'SKIPPED — expected text not found',
          expected: fix.from,
        })
        continue
      }
      await payload.update({ collection: 'products', id: fix.id, data: { description: descCopy } as never })
      results.push({ id: fix.id, field: fix.field, status: 'APPLIED' })
      affectedProductIds.add(fix.id)
      continue
    }

    const current: string = p.shortDescription ?? ''
    if (!current.includes(fix.from)) {
      results.push({
        id: fix.id,
        field: fix.field,
        status: 'SKIPPED — expected substring not found',
        expected: fix.from,
        actual: current,
      })
      continue
    }

    await payload.update({
      collection: 'products',
      id: fix.id,
      data: { shortDescription: current.split(fix.from).join(fix.to) } as never,
    })
    results.push({ id: fix.id, field: fix.field, status: 'APPLIED' })
    affectedProductIds.add(fix.id)
  }

  fs.writeFileSync('/tmp/warranty-strip-results.json', JSON.stringify(results, null, 2))
  const applied = results.filter((r: any) => r.status === 'APPLIED').length
  console.log(`Applied ${applied}/${FIXES.length} field edits across ${affectedProductIds.size} products.`)
  console.log('Affected product ids:', [...affectedProductIds].join(', '))
  process.exit(0)
}

run()
