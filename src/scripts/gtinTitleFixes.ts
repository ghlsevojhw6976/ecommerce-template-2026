import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Applies the confirmed fixes from the 2026-08-12/13 full-catalogue GTIN
 * cross-reference audit (every GTIN checked against its real Amazon ASIN
 * listing). Each fix is an exact substring replace, guarded: skipped (and
 * logged) if the current DB value doesn't contain the expected "from" text,
 * so a concurrent admin edit can't be silently clobbered. Idempotent — safe
 * to re-run.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gtinTitleFixes.ts           # dry run
 *   pnpm exec tsx --env-file=.env src/scripts/gtinTitleFixes.ts --apply   # writes
 */

type Fix = {
  id: number
  title?: { from: string; to: string }
  brand?: { from: string; to: string }
}

const FIXES: Fix[] = [
  { id: 277, title: { from: 'Smart Nest', to: "Chef's Classic (77-11G)" } },
  {
    id: 313,
    title: {
      from: 'SKYSHALO Fully Automatic Espresso Machine – 1.8 liters – Glossy Black (Ep 3341/ 50)',
      to: 'Philips 3300 Series Fully Automatic Espresso Machine – 1.8 liters – Glossy Black (EP3341/50)',
    },
    brand: { from: 'SKYSHALO', to: 'Philips' },
  },
  { id: 316, title: { from: 'Professional Series 750', to: 'Propel Series 750' } },
  {
    id: 341,
    title: { from: 'Nama C2 Cold Press Juicer and Blender', to: 'Nama J2 Cold Press Juicer' },
  },
  {
    id: 359,
    title: {
      from: 'Watnature Automatic Ice Cream Maker VGJ0Z4FOS34E',
      to: 'Whynter Automatic Ice Cream Maker ICM-220SSY',
    },
  },
  { id: 374, title: { from: 'ICE-70P1', to: 'ICE-70WB' } },
  {
    id: 366,
    title: {
      from: '30-Piece Espresso Machine',
      to: 'Crema Supreme Espresso Machine with Grinder, 30 Grind Settings',
    },
  },
  { id: 391, title: { from: 'Set of 10 Japanese knives', to: 'Set of 6 Japanese knives' } },
  { id: 403, title: { from: '5-Piece Cookware Set', to: '8-Piece Cookware Set' } },
  {
    id: 430,
    title: {
      from: 'UUDULY 14-Piece Mirror Polished Stainless Steel Cookware Set – Mirror Polished Stainless Steel - 6 Years Warrantv',
      to: 'HOMICHEF 14-Piece Mirror Polished Stainless Steel Cookware Set – Mirror Polished Stainless Steel',
    },
    brand: { from: 'UUDULY', to: 'HOMICHEF' },
  },
  { id: 441, title: { from: 'Single Zone 24-Bottle', to: 'Dual Zone 37-Bottle' } },
  { id: 443, title: { from: '74 QT Portable Cooler', to: '61.5 QT Portable Car Refrigerator' } },
  {
    id: 446,
    title: {
      from: 'Latitude Run Kitchen Island Cart Rolling Kitchen Island with Storage Solid Wood Top',
      to: 'YITAHOME Small Solid Wood Top Kitchen Island Cart on Wheels with Storage',
    },
    brand: { from: 'Latitude Run', to: 'YITAHOME' },
  },
  {
    id: 454,
    title: {
      from: 'Ninja FrostVault 30 Qt. Wheeled Cooler with Dry Zone',
      to: 'Ninja FrostVault 50 Qt. Wheeled Cooler with Dry Zone',
    },
  },
  {
    id: 464,
    title: {
      from: 'Keurig K-1550 Single Serve Coffee Maker Bundle',
      to: 'Keurig K-Elite Single Serve Coffee Maker Bundle',
    },
  },
  {
    id: 468,
    title: {
      from: 'Thyme & Table Fully Automatic Espresso Machine',
      to: 'ICEVIVAL Fully Automatic Espresso Machine',
    },
    brand: { from: 'Thyme & Table', to: 'ICEVIVAL' },
  },
  {
    id: 469,
    title: {
      from: 'Wilkie Coupe Fine Bone Dinner Set',
      to: 'Studio 1414 Coupe Bone China 24-Piece Dinnerware Set for 8',
    },
  },
  {
    id: 470,
    title: {
      from: 'Fellow Espresso Series 1, Woodland + Walnut, Woodland + Walnut',
      to: 'Fellow Espresso Series 1',
    },
  },
  {
    id: 472,
    title: {
      from: 'Prestige PIC 9.0 2000 W Induction Cooktop',
      to: 'Nuwave PIC Double Pro Induction Cooktop',
    },
  },
  {
    id: 477,
    title: {
      from: 'Wudkey 14-Piece Stainless Steel German Knife Set',
      to: 'FIKSHOT 14-Piece Stainless Steel German Knife Set',
    },
    brand: { from: 'Wudkey', to: 'FIKSHOT' },
  },
  {
    id: 480,
    title: { from: 'Latitude Kitchen Island Cart', to: 'VEVOR Kitchen Island Cart' },
    brand: { from: 'Latitude Run', to: 'VEVOR' },
  },
  {
    id: 483,
    title: {
      from: 'JFVKAF 64mm Flat Burr Coffee Grinder',
      to: 'DAOFEL 64mm Flat Burr Coffee Grinder',
    },
  },
  { id: 485, title: { from: 'cgf01rdeu', to: 'CGF03' } },
  {
    id: 486,
    title: { from: 'StyleWell 32 in. Folding Kitchen Cart', to: 'VEVOR 32 in. Kitchen Island Cart' },
    brand: { from: 'StyleWell', to: 'VEVOR' },
  },
  {
    id: 487,
    title: {
      from: 'Red Barrel Studio Kitchen Island Cart with 4 Door Cabinet Drawers and Locking Wheels Solid Wood Top',
      to: 'Best Choice Products 36in Large Rolling Kitchen Island Cart with 2-Door Cabinet',
    },
    brand: { from: 'Red Barrel Studio', to: 'Best Choice Products' },
  },
  {
    id: 490,
    title: {
      from: 'Anqtovp 64mm Stainless Steel Electric Coffee Grinder',
      to: 'Mokkom 64mm Flat Burr Coffee Grinder',
    },
  },
  { id: 492, title: { from: ' Stone Grey – Black', to: ' – Black' } },
  { id: 495, title: { from: 'SOZT 23.5 in.', to: 'Velivi 24 in.' } },
  { id: 496, title: { from: '46 Bottle', to: '52 Bottle' } },
  {
    id: 497,
    title: {
      from: '12-Piece Hard-Anodized Ceramic Induction Cookware Set – Agave',
      to: '9-Piece Hard-Anodized Ceramic Induction Cookware Set – Agave',
    },
  },
  {
    id: 499,
    title: {
      from: 'Panasonic SR-GA541FH 60 Cup Electric Rice Cooker',
      to: 'Panasonic SR-GA721L 80-Cup Electric Rice Cooker',
    },
  },
  {
    id: 503,
    title: { from: 'TCL 24 in. Single Zone Beverage Cooler', to: 'TCL 24 in. Dual Zone Beverage Cooler' },
  },
  { id: 506, title: { from: 'Cajun Fryer 6 Gallon Deep Fryer', to: 'Cajun Fryer 12 Gallon Deep Fryer' } },
  { id: 510, title: { from: 'COM532M', to: 'COM530M' } },
  {
    id: 515,
    title: {
      from: 'Large End Grain Walnut Wood Cutting Board Walnut 18x12x1.25" / Design 1 – 24"L x 15"W',
      to: 'Large End Grain Walnut Wood Cutting Board – 25"L x 15"W',
    },
  },
  {
    id: 522,
    title: {
      from: 'Vitamix Ascent X4 SmartPrep Kitchen System, Brushed Stainless, Silver – White',
      to: 'Vitamix Ascent X4 SmartPrep Kitchen System – White',
    },
  },
  {
    id: 523,
    title: {
      from: 'Wudkey 18-Piece White Cappuccino Ceramic Dinnerware Sets',
      to: 'Famiware 18-Piece White Cappuccino Ceramic Dinnerware Sets',
    },
    brand: { from: 'Wudkey', to: 'Famiware' },
  },
  {
    id: 524,
    title: {
      from: '12-Piece Hard Anodized Ceramic Nonstick Cookware Set Empire Red',
      to: '9-Piece Hard Anodized Ceramic Nonstick Cookware Set Empire Red',
    },
  },
  {
    id: 530,
    title: {
      from: 'Breville Barista Express Impress - Damson Blue Besdblbna',
      to: 'Breville Barista Touch Impress - Damson Blue BES881DBL',
    },
  },
  {
    id: 547,
    title: {
      from: 'Unbranded 1 Inch Induction Cooktops with 5 Burners, Black',
      to: 'BIGoods Induction Cooktop with 5 Burners, Black',
    },
  },
  {
    id: 553,
    title: { from: '14 Piece Premium Cookware Set', to: '13 Piece Premium Cookware Set' },
  },
  { id: 555, title: { from: '4 Cup Drip Coffee Maker', to: '10 Cup Drip Coffee Maker' } },
  {
    id: 559,
    title: {
      from: 'GreenPan Reserve Pro Stainless-Steel Color Series 10-Piece Cookware Set',
      to: 'GreenPan Reserve Pro Hard Anodized 10-Piece Cookware Set',
    },
  },
  {
    id: 564,
    title: {
      from: 'Wine Enthusiast 18-Bottle Slimline Dual Zone Wine Cooler',
      to: 'Wine Enthusiast 12-Bottle Slimline Wine Cooler',
    },
  },
  {
    id: 570,
    title: {
      from: 'Global Industrial Square Recycling/Trash Can with Waste Lid',
      to: 'Global Industrial Square Recycling/Trash Can (No Lid)',
    },
  },
  {
    id: 573,
    title: {
      from: 'Dinnerware Set | JazzUpCo Matte White / Minimalist 2.0 / Matte Gold',
      to: 'Flatware Set | JazzUpCo Minimalist 2.0 40-Piece Matte Gold',
    },
  },
  {
    id: 576,
    title: {
      from: 'Le Creuset 3-Piece Toughened Nonstick Pro Cookware Set',
      to: 'Le Creuset 6-Piece Toughened Nonstick Pro Cookware Set',
    },
  },
  { id: 580, title: { from: '10-Pc. Cookware Set', to: '12-Piece Cookware Set' } },
  {
    id: 582,
    title: {
      from: "Caterer's Box Stainless Steel Flatware Set of 36",
      to: 'Studio 1414 Stainless Steel Flatware Set of 36',
    },
  },
  {
    id: 586,
    title: {
      from: 'ZWILLING Spirit 3-Ply 10-pc Stainless Steel Cookware Set',
      to: 'ZWILLING Spirit 3-Ply 7-pc Stainless Steel Cookware Set',
    },
  },
  {
    id: 587,
    title: {
      from: 'La Cuisine PRO 5-Piece Enameled Cast Iron Cookware Set',
      to: 'Le Creuset Signature 5-Piece Enameled Cast Iron Cookware Set',
    },
    brand: { from: 'La Cuisine', to: 'Le Creuset' },
  },
  {
    id: 589,
    title: {
      from: 'Better Homes & Gardens Tarren Outdoor Island Serving Cart',
      to: 'Christopher Knight Home Edsel Outdoor Bar Cart',
    },
    brand: { from: 'Better Homes & Gardens', to: 'Christopher Knight Home' },
  },
  {
    id: 590,
    title: {
      from: 'Bakken Swiss 23-Piece Nonstick Cookware & Bakeware Set',
      to: 'Bakken Swiss 20-Piece Nonstick Cookware & Bakeware Set',
    },
  },
  { id: 592, title: { from: 'FM5200', to: 'FM5460' } },
  {
    id: 601,
    title: {
      from: 'GreenPan GP5 Stainless Steel 10-Piece Cookware Set',
      to: 'GreenPan GP5 Stainless Steel 13-Piece Cookware Set',
    },
  },
  {
    id: 602,
    title: { from: 'By Bone Dinnerware Set Armonia', to: 'Sandra Bone China Dinnerware Set, 57-Piece' },
  },
  {
    id: 603,
    title: { from: 'Miyabi Evolution Santoku Knife 5.5" – 6"', to: "Miyabi Evolution Chef's Knife 6\"" },
  },
  {
    id: 623,
    title: {
      from: 'All-Clad Copper Core Nonstick 3 Qt. Saute Pan with Lid',
      to: 'All-Clad HA1 Ceramic Nonstick 6 Qt. Saute Pan with Lid',
    },
  },
  {
    id: 626,
    title: {
      from: 'All-Clad Ultimate Soup Pot 6 qt w/ Lid',
      to: 'All-Clad HA1 Expert Stock Pot 8 Qt w/ Lid',
    },
  },
  {
    id: 629,
    title: {
      from: 'Le Creuset 1.5 Quart Signature Cast Iron Braiser',
      to: 'Le Creuset 2.75 Quart Signature Pumpkin Cast Iron Braiser',
    },
  },
  { id: 632, title: { from: 'TB401', to: 'BN805A' } },
  {
    id: 647,
    title: {
      from: 'Calphalon Hard-Anodized Nonstick 14-Piece Cookware Set',
      to: 'Calphalon Hard-Anodized Nonstick 6-Piece Cookware Set',
    },
  },
  {
    id: 649,
    title: {
      from: 'Check Canister MacKenzie-Childs – Sterling Check',
      to: 'MacKenzie-Childs Enamel Canister Set of 3 – Gray-and-White Sterling Check',
    },
  },
  { id: 428, brand: { from: 'Artisan Fire', to: 'Bioexcel' } },
]

const run = async (): Promise<void> => {
  const apply = process.argv.includes('--apply')
  const payload = await getPayload({ config })

  let fixed = 0
  let skippedTitle = 0
  let skippedBrand = 0

  for (const fix of FIXES) {
    const doc = await payload.findByID({ collection: 'products', id: fix.id, depth: 0 })
    if (!doc) {
      console.log(`id ${fix.id}: NOT FOUND, skipping`)
      continue
    }

    const data: Record<string, unknown> = {}
    let touched = false

    if (fix.title) {
      const current = (doc.title ?? '') as string
      if (current.includes(fix.title.from)) {
        data.title = current.split(fix.title.from).join(fix.title.to)
        touched = true
      } else {
        console.log(`id ${fix.id}: title SKIP — "${fix.title.from}" not found in "${current}"`)
        skippedTitle++
      }
    }

    if (fix.brand) {
      const currentBrand = (doc as unknown as { brand?: string }).brand ?? ''
      if (currentBrand.includes(fix.brand.from)) {
        data.brand = currentBrand.split(fix.brand.from).join(fix.brand.to)
        touched = true
      } else {
        console.log(`id ${fix.id}: brand SKIP — "${fix.brand.from}" not found in "${currentBrand}"`)
        skippedBrand++
      }
    }

    if (!touched) continue

    console.log(`id ${fix.id}:`)
    if (data.title) console.log(`  title -> ${data.title}`)
    if (data.brand) console.log(`  brand -> ${data.brand}`)

    if (apply) {
      await payload.update({ collection: 'products', id: fix.id, data, context: { disableRevalidate: true } })
    }
    fixed++
  }

  console.log(`\n${apply ? 'APPLIED' : 'DRY RUN'}: ${fixed} products touched, ${skippedTitle} title skips, ${skippedBrand} brand skips (out of ${FIXES.length} fixes defined)`)
  process.exit(0)
}

run()
