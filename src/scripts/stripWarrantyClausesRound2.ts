import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'

/**
 * Round 2 of the warranty-clause strip (owner decision 2026-08-12, see
 * stripWarrantyClauses.ts for the full rationale). Round 1 only checked
 * `shortDescription`/`color`/`size` via direct SQL and missed the full
 * `description` field entirely — which, being uncapped, usually contains
 * MORE text than the 300-char `shortDescription`, including the trailing
 * warranty sentence that shortDescription had coincidentally already been
 * truncated before reaching. This is that missed set: 24 products.
 *
 * 568 (and the already-known 587, 575) are deliberately NOT included —
 * "beautiful, lifetime." is a customer-feedback-theme keyword, not a
 * warranty claim, and stays flagged for manual review rather than guessed
 * at.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/stripWarrantyClausesRound2.ts
 */

type Fix = { id: number; from: string; to: string }

const FIXES: Fix[] = [
  {
    id: 654,
    from: 'Care: dishwasher safe. backed by limited lifetime warranty.',
    to: 'Care: dishwasher safe.',
  },
  {
    id: 652,
    from: 'quality, want, before, dishwasher. Backed by limited lifetime warranty.',
    to: 'quality, want, before, dishwasher.',
  },
  {
    id: 623,
    from: 'Care: hand wash only, oven safe up to 450f. backed by 1 year limited warranty.',
    to: 'Care: hand wash only, oven safe up to 450f.',
  },
  {
    id: 604,
    from: 'Care: oven safe. backed by limited lifetime warranty on manufacturing defects.',
    to: 'Care: oven safe.',
  },
  {
    id: 603,
    from: 'Recurring themes in customer feedback: knives, only, japanese. Backed by lifetime warranty.',
    to: 'Recurring themes in customer feedback: knives, only, japanese.',
  },
  {
    id: 599,
    from: '3-quart covered sauté. Backed by hassle free lifetime guarantee.',
    to: '3-quart covered sauté.',
  },
  {
    id: 548,
    from: 'Recurring themes in customer feedback: quality, cooking, evenly. Backed by lifetime warranty.',
    to: 'Recurring themes in customer feedback: quality, cooking, evenly.',
  },
  {
    id: 525,
    from: 'Recurring themes in customer feedback: easy, cooking, excellent. Backed by limited lifetime warranty.',
    to: 'Recurring themes in customer feedback: easy, cooking, excellent.',
  },
  {
    id: 524,
    from: 'Recurring themes in customer feedback: easy, quality. Backed by limited lifetime warranty.',
    to: 'Recurring themes in customer feedback: easy, quality.',
  },
  {
    id: 494,
    from: 'portafilter centering device, user manual , warranty. Backed by 1 year manufacturer.',
    to: 'portafilter centering device, user manual.',
  },
  {
    id: 487,
    from: " Backed by 60 day warranty: all returns are shipped back to a best choice products return center at the customer's expense within 60 days of delivery; however, we will send a pre-paid return shipping label via email if the return is a result of our error. please note that it is at the company's discretion to decide if the item may be returned to a best choice products return center. unauthorized returns may not be accepted. once your claim is processed and approved, please allow 5-7 business days for the request to be completed. if a replacement unit or replacement parts are requested, please be aware that the fulfillment time-frame is based on product availability..",
    to: '',
  },
  {
    id: 485,
    from: 'portafilter centering device, user manual , warranty. Backed by 1 year manufacturer.',
    to: 'portafilter centering device, user manual.',
  },
  {
    id: 449,
    from: 'Recurring themes in customer feedback: kitchen, cookware, bakeware, quality. Backed by 1 year warranty.',
    to: 'Recurring themes in customer feedback: kitchen, cookware, bakeware, quality.',
  },
  {
    id: 427,
    from: 'Recurring themes in customer feedback: easy, handles. Care: dishwasher safe. backed by lifetime warranty.',
    to: 'Recurring themes in customer feedback: easy, handles. Care: dishwasher safe.',
  },
  {
    id: 421,
    from: 'Recurring themes in customer feedback: cooking, quality, because, surface. Backed by limited lifetime warranty.',
    to: 'Recurring themes in customer feedback: cooking, quality, because, surface.',
  },
  {
    id: 403,
    from: 'Recurring themes in customer feedback: cooking, heavy, easy, way. Backed by lifetime warranty.',
    to: 'Recurring themes in customer feedback: cooking, heavy, easy, way.',
  },
  {
    id: 401,
    from: 'Recurring themes in customer feedback: chicken, machine, kitchen, review. Backed by one(1) year warranty.',
    to: 'Recurring themes in customer feedback: chicken, machine, kitchen, review.',
  },
  {
    id: 392,
    from: 'Recurring themes in customer feedback: handle, beautiful, cutting, comfortable. Backed by lifetime warranty.',
    to: 'Recurring themes in customer feedback: handle, beautiful, cutting, comfortable.',
  },
  {
    id: 381,
    from: 'Care: dishwasher safe. backed by lifetime warranty.',
    to: 'Care: dishwasher safe.',
  },
  {
    id: 331,
    from: 'Care: dishwasher safe. backed by limited lifetime warranty.',
    to: 'Care: dishwasher safe.',
  },
  {
    id: 322,
    from: 'trash can, code q liner trial pack, odorsorb pod starter pack, 10-year warranty.',
    to: 'trash can, code q liner trial pack, odorsorb pod starter pack.',
  },
  {
    id: 317,
    from: 'Recurring themes in customer feedback: handles, stay, handle, utensils. Backed by limited lifetime warranty.',
    to: 'Recurring themes in customer feedback: handles, stay, handle, utensils.',
  },
  {
    id: 308,
    from: 'Recurring themes in customer feedback: kitchen, quality, handle, cooking. Backed by limited lifetime warranty - all-clad cookware.',
    to: 'Recurring themes in customer feedback: kitchen, quality, handle, cooking.',
  },
  {
    id: 278,
    from: 'Recurring themes in customer feedback: consistent, machine, grinding, ground. Backed by two-year warranty.',
    to: 'Recurring themes in customer feedback: consistent, machine, grinding, ground.',
  },
  {
    id: 277,
    from: 'Recurring themes in customer feedback: evenly, cooking, quality, nonstick. Backed by lifetime warranty.',
    to: 'Recurring themes in customer feedback: evenly, cooking, quality, nonstick.',
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

  for (const fix of FIXES) {
    const p: any = await payload.findByID({ collection: 'products', id: fix.id, depth: 0 })

    if (!p.description) {
      results.push({ id: fix.id, status: 'SKIPPED — no description' })
      continue
    }
    const descCopy = JSON.parse(JSON.stringify(p.description))
    if (!replaceInLexical(descCopy, fix.from, fix.to)) {
      results.push({ id: fix.id, status: 'SKIPPED — expected substring not found', expected: fix.from })
      continue
    }
    await payload.update({ collection: 'products', id: fix.id, data: { description: descCopy } as never })
    results.push({ id: fix.id, status: 'APPLIED' })
  }

  fs.writeFileSync('/tmp/warranty-strip-round2-results.json', JSON.stringify(results, null, 2))
  const applied = results.filter((r: any) => r.status === 'APPLIED').length
  console.log(`Applied ${applied}/${FIXES.length}.`)
  process.exit(0)
}

run()
