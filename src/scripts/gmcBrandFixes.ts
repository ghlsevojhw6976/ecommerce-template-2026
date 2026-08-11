import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'

/**
 * GMC misrepresentation audit — brand attribute fixes.
 *
 * Found during the 2026-08-11 final audit: for 382 products, `brand` was
 * faithfully copied from the import CSV's own `brand` column (verified —
 * zero products disagree with their own CSV row), so this isn't an import
 * bug like the color/size contamination fixed earlier. The CSV's `brand`
 * column itself is wrong for a subset of rows — it names a DIFFERENT real
 * company than the one the title (and, for each entry below, independently
 * verified via web search) names as the actual maker/seller.
 *
 * Every entry here was checked against a live source (the brand's own
 * site, a major retailer listing, or the exact ASIN's real Amazon listing)
 * before being added — see the audit conversation for the source per item.
 * Two are especially serious: 313 falsely claimed Philips (it's an
 * independent brand called SKYSHALO) and 442 falsely claimed a random
 * reseller name for a product that IS a genuine Weber-made accessory —
 * both are exactly the kind of false trademark claim Google's
 * misrepresentation enforcement targets.
 *
 * Exact-match guarded per product so a concurrent admin edit can't be
 * clobbered.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gmcBrandFixes.ts
 */

type Fix = {
  id: number
  field: 'brand' | 'title'
  from: string
  to: string
  source: string
}

const FIXES: Fix[] = [
  { id: 587, field: 'brand', from: 'Le Creuset', to: 'La Cuisine', source: 'lacuisinecookware.com sells this exact "PRO" cast iron range under its own name' },
  { id: 589, field: 'brand', from: 'Christopher Knight Home', to: 'Better Homes & Gardens', source: 'Walmart/Better Homes & Gardens sells the "Tarren Outdoor Island Steel Serving Cart" by that exact name' },
  { id: 539, field: 'brand', from: 'Koolatron', to: 'Kenmore', source: 'sold everywhere (Home Depot, Kohls, Sears) as "Kenmore 11-In-1..."; Koolatron is the licensee/distributor, Kenmore is the retail brand' },
  { id: 523, field: 'brand', from: 'Famiware Premium', to: 'Wudkey', source: 'Wudkey sells a matching 12-piece ceramic dinnerware set at The Home Depot under its own name' },
  { id: 477, field: 'brand', from: 'FikShot', to: 'Wudkey', source: 'Wudkey sells matching German-steel knife block sets at The Home Depot under its own name' },
  { id: 468, field: 'brand', from: 'ICEVIVAL', to: 'Thyme & Table', source: 'Thyme & Table (Walmart-exclusive) sells this exact espresso machine line' },
  { id: 372, field: 'brand', from: 'EUHOMY', to: 'Thyme & Table', source: 'Thyme & Table (Walmart-exclusive) sells this exact espresso machine line; EUHOMY makes wine coolers/beverage fridges, not espresso machines' },
  { id: 478, field: 'brand', from: 'PeakPursuit', to: 'VEVOR', source: 'vevor.com sells the exact "15Qt Commercial Stand Mixer" under its own name' },
  { id: 313, field: 'brand', from: 'PHILIPS', to: 'SKYSHALO', source: 'SKYSHALO is a verified independent brand (Home Depot, Lowes, Walmart listings under its own name); not a Philips product' },
  { id: 487, field: 'brand', from: 'Best Choice Products', to: 'Red Barrel Studio', source: 'Red Barrel Studio (Wayfair house brand) sells matching kitchen island carts under its own name' },
  { id: 442, field: 'brand', from: 'DELSbbq', to: 'Weber', source: "weber.com sells this exact accessory: \"Genesis Full-Size Griddle – 400 Series\", model 6789" },
  { id: 446, field: 'brand', from: 'YITAHOME', to: 'Latitude Run', source: 'Latitude Run (Wayfair house brand) is named explicitly and in full in the title' },
  { id: 387, field: 'brand', from: 'VASAGLE', to: '17 Stories', source: '17 Stories (Wayfair house brand) is named explicitly and in full in the title' },
  { id: 324, field: 'brand', from: 'GRUSIGN', to: 'Highland Dunes', source: 'Highland Dunes (Wayfair house brand) is named explicitly and in full in the title' },
  { id: 486, field: 'brand', from: 'VEVOR', to: 'StyleWell', source: 'StyleWell (Home Depot house brand) is named explicitly and in full in the title' },
  { id: 334, field: 'brand', from: 'Bevel & Bond', to: 'Deer Park Woodwork', source: 'title explicitly credits "by Deer Park Woodwork"' },
  { id: 319, field: 'brand', from: 'Typhur', to: 'Cosori', source: 'Cosori is named explicitly and in full in the title; well-known air fryer brand' },
  { id: 276, field: 'brand', from: 'Ninja', to: 'Drew Barrymore Beautiful', source: '"Drew Barrymore Beautiful" is a documented, real Walmart-exclusive kitchenware line, named explicitly in the title' },
  {
    id: 556,
    field: 'title',
    from: 'Thor Kitchen 3-Piece Damascus Knife Set DS0301P – 6.7 inches – Knife Sets',
    to: 'Wakoli EDIB 3-Piece Damascus Kitchen Knife Set – 6.7 inches – Knife Sets',
    source: 'the reverse case: brand field "Wakoli" was correct (this exact ASIN, B00KGDVXE8, is Wakoli\'s own listing) — the TITLE was wrong, borrowing an unrelated Thor Kitchen model name/number',
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

  fs.writeFileSync('/tmp/gmc-brand-fixes-applied.json', JSON.stringify(results, null, 2))
  const applied = results.filter((r: any) => r.status === 'APPLIED').length
  console.log(`Applied ${applied}, skipped ${results.length - applied} (of ${FIXES.length}).`)
  process.exit(0)
}

run()
