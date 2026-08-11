import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'
import path from 'path'

/**
 * GMC misrepresentation audit — apply fixes.
 *
 * Every fix here was manually verified against the original import CSV
 * (imports/hot_products_rewritten.csv) before being written into this list —
 * see the audit conversation for the reasoning per product. This script does
 * NOT re-derive anything; it applies a fixed set of {id, field, from, to}
 * changes, each guarded by an exact-match check against the CURRENT DB value
 * so a concurrent admin edit can never be silently clobbered (if `from`
 * doesn't match what's actually in the DB right now, that change is skipped
 * and reported, not forced).
 *
 * Uses payload.update per product so the collection's normal afterChange
 * hook (revalidateProduct) fires and purges exactly that product's cached
 * pages — no full site rebuild needed.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gmcApplyFixes.ts
 */

type Fix = {
  id: number
  field: 'title' | 'color' | 'size' | 'shortDescription' | 'description'
  from: string | null
  to: string | null
  reason: string
}

const FIXES: Fix[] = [
  // --- Stray `color` field on standalone (non-family) products: the field
  // isn't meant to be populated outside an itemGroupId family (see the admin
  // condition in sourcingFields.ts) but leaked in at import and contradicts
  // the customer-visible title. Nulling it removes the contradiction from
  // both the Merchant feed's `color` attribute and the PDP's JSON-LD.
  { id: 621, field: 'color', from: 'Contour Silver', to: null, reason: 'title says Cast Iron Black' },
  { id: 570, field: 'color', from: 'Black', to: null, reason: 'title says Blue' },
  { id: 538, field: 'color', from: 'Blue', to: null, reason: 'title says Black' },
  { id: 480, field: 'color', from: 'Green', to: null, reason: 'title says Black' },
  { id: 446, field: 'color', from: 'Brown', to: null, reason: 'title says White' },
  { id: 442, field: 'color', from: 'Gray', to: null, reason: 'title says Black' },
  { id: 375, field: 'color', from: 'Royal Blue', to: null, reason: 'title says Rescue Red' },
  { id: 373, field: 'color', from: 'White', to: null, reason: 'title says Navy' },
  { id: 369, field: 'color', from: 'Navy', to: null, reason: 'title says White' },

  // --- Truncated color field, restored from CSV (both color columns +
  // variant_attributes independently agree on the full value).
  { id: 433, field: 'color', from: 'Stainless Steel', to: 'Stainless Steel/Silver', reason: 'CSV: full value is Stainless Steel/Silver, DB was truncated' },
  { id: 441, field: 'color', from: 'Stainless Steel', to: 'Stainless Steel/Silver', reason: 'CSV: full value is Stainless Steel/Silver, DB was truncated' },

  // --- `size` field cross-contaminated between two unrelated wine coolers
  // at import (both rows carried the identical, garbled string). Replaced
  // with each product's own, self-consistent value.
  { id: 433, field: 'size', from: '24Inch-Dual Zone 46Bottles(5.65Cu.ft)', to: '45 Bottle', reason: 'shared corrupted value with product 441; own title says 45 Bottle' },
  { id: 441, field: 'size', from: '24Inch-Dual Zone 46Bottles(5.65Cu.ft)', to: '24 Bottle', reason: 'shared corrupted value with product 433; own title says 24-Bottle' },

  // --- `size` field disagreeing with the confirmed-correct title number
  // (checked against CSV's original, unprocessed `title` column).
  { id: 496, field: 'size', from: '24 inch - 52 bottle', to: '24 inch - 46 bottle', reason: 'CSV original title confirms 46 Bottle, not 52' },
  { id: 540, field: 'size', from: '90 Bottle', to: '100 Bottle', reason: 'CSV original title confirms 100 Bottle, not 90' },
  { id: 307, field: 'size', from: '6 quarts', to: '6.5 quarts', reason: 'CSV original title confirms 6.5 Qt, not 6' },

  // --- `size` field missing content present in CSV (truncated at import).
  { id: 504, field: 'size', from: '30in 5 Burners', to: '30in 5 Burners/220V', reason: 'CSV: full value includes /220V' },
  { id: 443, field: 'size', from: '753 x 461 x 558 mm', to: '753 x 461 x 558 mm / 29.6 x 18.1 x 22 in', reason: 'CSV: full value includes the inches conversion' },

  // --- Garbage `color` field: not a color at all, marketing/spec text that
  // landed in the color slot at import because these titles have no real
  // color and the generator still filled the template slot.
  { id: 504, field: 'color', from: 'Timer & Child Lock Included, 9 Power Levels for Simmer Steam Slow Cook Fry', to: null, reason: 'not a color; no real color exists for this product' },
  { id: 556, field: 'color', from: '3pcs-Damascus Kitchen Knife Set', to: null, reason: 'not a color; no real color exists for this product' },

  // --- Titles: rebuilt to drop the garbage color segment and/or fix a
  // truncated ending (VEVOR's was cut mid-sentence at a hard 150-char cap),
  // or to correct a number against the CSV-confirmed ground truth.
  {
    id: 504,
    field: 'title',
    from: 'VEVOR 30" Built-in Induction Electric Cooktop – 30in 5 Burners/220V – Timer & Child Lock Included, 9 Power Levels for Simmer Steam Slow Cook Fry – Coo',
    to: 'VEVOR 30" Built-in Induction Electric Cooktop – 30in 5 Burners/220V – Cooktops',
    reason: 'drop bogus color segment + fix truncated category',
  },
  {
    id: 556,
    field: 'title',
    from: 'Thor Kitchen 3-Piece Damascus Knife Set DS0301P – 6.7 inches – 3pcs-Damascus Kitchen Knife Set – Knife Sets',
    to: 'Thor Kitchen 3-Piece Damascus Knife Set DS0301P – 6.7 inches – Knife Sets',
    reason: 'drop bogus color segment',
  },
  {
    id: 495,
    field: 'title',
    from: 'SOZT 23.5 in. Dual Zone 18-Wine Bottles and 68-Cans Beverage & Wine Co – 4.9 cubic feet – Black01 – Beverage Refrigerators',
    to: 'SOZT 23.5 in. Dual Zone 19-Wine Bottles and 57-Cans Beverage & Wine Cooler – 4.9 cubic feet – Silver – Beverage Refrigerators',
    reason: 'title bottle/can counts + color contradict CSV-corroborated structured fields (19/57/Silver); also fixes truncated ending',
  },
  {
    id: 307,
    field: 'title',
    from: 'Ninja HyperHeat 6.5 Qt 9-in-1 Electric Pressure Cooker – 6 quarts – Grey – Electric Pressure Cookers',
    to: 'Ninja HyperHeat 6.5 Qt 9-in-1 Electric Pressure Cooker – 6.5 quarts – Grey – Electric Pressure Cookers',
    reason: 'title states 6.5 Qt and 6 quarts in the same string; CSV original title confirms 6.5',
  },

  // --- Descriptions restating a wrong number as if it were the product name.
  {
    id: 495,
    field: 'shortDescription',
    from: 'Owners keep coming back to the SOZT 23.5 in. Dual Zone 18-Wine Bottles and 68-Cans for the same reasons: fridge, service, drinks. Key details: 4.9 cubic feet capacity, weighing 90 pounds. In the box: beverage refrigerator, manual.',
    to: 'Owners keep coming back to the SOZT 23.5 in. Dual Zone 19-Wine Bottles and 57-Cans for the same reasons: fridge, service, drinks. Key details: 4.9 cubic feet capacity, weighing 90 pounds. In the box: beverage refrigerator, manual.',
    reason: 'echoes the wrong bottle/can counts from the old title',
  },
  {
    // shortDescription is hard-capped at 300 chars and this one was already
    // truncated with a trailing "…" at import — fix only the leading number,
    // don't attempt to restore the truncated tail (that's a separate,
    // non-misrepresentation quality issue). The full-text `description`
    // richText field (no length cap) gets the complete substitution via the
    // shared replaceInLexical pass below since `from`/`to` still match a
    // substring of it.
    id: 307,
    field: 'shortDescription',
    from: 'At 6 quarts, the Ninja HyperHeat 6.5 Qt 9-in-1 Electric Pressure Cooker is sized for real cooking — enough for a family meal without dominating the counter. Key details: 1200 watts, weighing 15.9 pounds. In the box: 1200-watt powerful hyperheat™ base, 6.5-qt removable simpliserve pot, pressure co…',
    to: 'At 6.5 quarts, the Ninja HyperHeat 6.5 Qt 9-in-1 Electric Pressure Cooker is sized for real cooking — enough for a family meal without dominating the counter. Key details: 1200 watts, weighing 15.9 pounds. In the box: 1200-watt powerful hyperheat™ base, 6.5-qt removable simpliserve pot, pressure co…',
    reason: 'opens by restating the wrong capacity (6 vs 6.5)',
  },
  {
    // description (richText, no length cap) has the FULL text — a separate
    // fix from shortDescription's truncated one above, same underlying typo.
    id: 307,
    field: 'description',
    from: 'At 6 quarts, the Ninja HyperHeat 6.5 Qt 9-in-1 Electric Pressure Cooker is sized for real cooking',
    to: 'At 6.5 quarts, the Ninja HyperHeat 6.5 Qt 9-in-1 Electric Pressure Cooker is sized for real cooking',
    reason: 'opens by restating the wrong capacity (6 vs 6.5); full description is not length-capped so gets the complete fix',
  },
  {
    id: 580,
    field: 'shortDescription',
    from: 'Owners keep coming back to the Guy Fieri Flavortown Hard-Anodized Laser Titanium for the same reasons: seasoning, instructions, because. Key details: aluminum construction, 5 quarts capacity, weighing 15.42 kg. In the box: 12 piece laser titanium set. Care: dishwasher safe.',
    to: 'Owners keep coming back to the Guy Fieri Flavortown Hard-Anodized Laser Titanium for the same reasons: seasoning, instructions, because. Key details: aluminum construction, 5 quarts capacity, weighing 15.42 kg. In the box: 10-piece laser titanium set. Care: dishwasher safe.',
    reason: 'title + CSV original title confirm 10-Pc, description said 12',
  },
]

/** Recursively replace a text substring inside a lexical richText tree, in place. */
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

    if (fix.field === 'description') {
      // richText: the safety check IS the substitution match — if `from`
      // isn't found anywhere in the tree, nothing is skippable-comparable,
      // it just plain doesn't apply.
      if (!p.description || !fix.from || !fix.to) {
        results.push({ id: fix.id, field: fix.field, status: 'SKIPPED — no description or from/to', })
        continue
      }
      const descCopy = JSON.parse(JSON.stringify(p.description))
      if (!replaceInLexical(descCopy, fix.from, fix.to)) {
        results.push({
          id: fix.id,
          field: fix.field,
          status: 'SKIPPED — expected text not found in description',
          expected: fix.from,
        })
        continue
      }
      await payload.update({
        collection: 'products',
        id: fix.id,
        data: { description: descCopy } as never,
      })
      results.push({ id: fix.id, field: fix.field, status: 'APPLIED', from: fix.from, to: fix.to })
      continue
    }

    const current = p[fix.field]

    if ((current ?? null) !== (fix.from ?? null)) {
      results.push({
        id: fix.id,
        field: fix.field,
        status: 'SKIPPED — current value does not match expected `from`',
        expected: fix.from,
        actual: current,
      })
      continue
    }

    const data: Record<string, unknown> = { [fix.field]: fix.to }

    // Description richText mirrors shortDescription content for most of
    // these rows — apply the same text substitution there too, if present
    // and not already covered by an explicit field:'description' fix above.
    if (fix.field === 'shortDescription' && fix.from && fix.to && p.description) {
      const descCopy = JSON.parse(JSON.stringify(p.description))
      if (replaceInLexical(descCopy, fix.from, fix.to)) {
        data.description = descCopy
      }
    }

    await payload.update({
      collection: 'products',
      id: fix.id,
      data: data as never,
    })

    results.push({ id: fix.id, field: fix.field, status: 'APPLIED', from: fix.from, to: fix.to })
  }

  fs.writeFileSync(
    path.join(process.cwd(), 'imports/gmc-fixes-applied.json'),
    JSON.stringify(results, null, 2),
  )

  const applied = results.filter((r) => r.status === 'APPLIED').length
  const skipped = results.filter((r) => (r.status as string).startsWith('SKIPPED')).length
  console.log(`Applied ${applied}, skipped ${skipped} (of ${FIXES.length} total fixes).`)
  if (skipped) console.log('See imports/gmc-fixes-applied.json for skipped details.')
  process.exit(0)
}

run()
