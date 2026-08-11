import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'

/**
 * GMC brand audit, round 2 — the remaining candidates from the 2026-08-11
 * final audit's ~80-item "brand-not-in-title" heuristic list, each verified
 * against a live source (WebSearch) before being added here, same standard
 * as the first 19-fix round (gmcBrandFixes.ts). See the audit conversation
 * for the source per item.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gmcBrandFixesRound2.ts
 */

type Fix = {
  id: number
  field: 'brand' | 'title'
  from: string
  to: string
  source: string
}

const FIXES: Fix[] = [
  { id: 323, field: 'brand', from: 'Gaggia', to: 'Lelit', source: 'Lelit is a distinct, real Italian espresso brand (Brescia, part of Breville Group since 2022) — not Gaggia, a separate competing Italian brand' },
  { id: 300, field: 'brand', from: 'Gourmia', to: 'Statesman', source: 'Statesman (UK) sells this exact model, SKAO15017BK, under its own name at Amazon UK, Currys, Homebase, Wilko, Robert Dyas' },
  { id: 297, field: 'brand', from: 'Ninja', to: 'Wards', source: '"Chef Tested Air Fry French Door Oven by Wards" sold directly at wards.com (Montgomery Ward) and Ginny\'s/Country Door' },
  { id: 479, field: 'brand', from: 'VEVOR', to: 'WarmieHomy', source: 'WarmieHomy sells matching kitchen carts with solid wood top under its own name at The Home Depot' },
  { id: 351, field: 'brand', from: 'Midea', to: 'BridgePro', source: 'BridgePro Ltd (London) sells this exact 36L dual-zone air fryer oven under its own name at bgepro.com' },
  { id: 571, field: 'brand', from: 'CRAFTGEN', to: 'Groovy Guy Gifts', source: 'Groovy Guy Gifts (Monroe, CT) sells this exact golf cart whiskey decanter set under its own name' },
  { id: 430, field: 'brand', from: 'HOMICHEF', to: 'UUDULY', source: 'UUDULY sells matching stainless steel cookware under its own name at The Home Depot' },
  { id: 377, field: 'brand', from: 'ciwete', to: 'UUDULY', source: 'UUDULY sells matching stainless steel cookware under its own name at The Home Depot' },
  { id: 480, field: 'brand', from: 'VEVOR', to: 'Latitude Run', source: 'Latitude Run (Wayfair house brand) sells matching 35.4" kitchen island carts; title said "Latitude" (missing "Run")' },
  {
    id: 419,
    field: 'brand',
    from: 'VEDNHOL',
    to: 'Chef James',
    source: 'Chef James sells a "Titanium (Signature) Pan Set" directly at chefjames.com matching the title; VEDNHOL is a separate, real titanium-cookware brand whose own listings are titled "VEDNHOL Titanium..." not "Chef James" — lower confidence than the others (no exact-ASIN cross-check), included on title-vs-field consistency',
  },
  {
    // The reverse case: brand field was correct, title was wrong.
    id: 471,
    field: 'title',
    from: 'Revere Gourmet 6-Piece Tri-Ply Copper Cookware Set with Stainless Steel Lids – Cookware Sets',
    to: 'Ciwete Whole Tri-Ply 18/10 Stainless Steel Cookware Set, 10 Pcs Copper Pots and Pans Set – Cookware Sets',
    source: 'this exact ASIN (B09VX9MGX7) is listed on Amazon as "Ciwete Whole Tri-ply 18/10 Stainless Steel Cookware Set, 10 Pcs..." — the DB brand field "ciwete" was already correct, the title had borrowed the unrelated "Revere" name',
  },
]

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const results: Record<string, unknown>[] = []

  for (const fix of FIXES) {
    const p: any = await payload.findByID({ collection: 'products', id: fix.id, depth: 0 })
    const current = p[fix.field]

    if (current !== fix.from) {
      results.push({
        id: fix.id,
        field: fix.field,
        status: 'SKIPPED — current value does not match expected `from`',
        expected: fix.from,
        actual: current,
      })
      continue
    }

    await payload.update({
      collection: 'products',
      id: fix.id,
      data: { [fix.field]: fix.to } as never,
    })

    results.push({ id: fix.id, field: fix.field, status: 'APPLIED', from: fix.from, to: fix.to })
  }

  fs.writeFileSync('/tmp/gmc-brand-fixes-round2.json', JSON.stringify(results, null, 2))
  const applied = results.filter((r: any) => r.status === 'APPLIED').length
  console.log(`Applied ${applied}, skipped ${results.length - applied} (of ${FIXES.length}).`)
  process.exit(0)
}

run()
