import { cell, jsonCell, numberCell, type CsvTable } from './csv'

/**
 * One CSV row → the fields of a Product.
 *
 * Pure and synchronous so the mapping rules are testable without a database or
 * a network. Everything that needs Payload (media, categories, variants,
 * reviews) is handled by the orchestrator.
 */

export type SourceReview = {
  timestamp?: string
  rating?: number
  title?: string
  author?: string
  is_verified?: boolean
  helpful_count?: number
  content?: string
}

export type MappedRow = {
  // identity
  asin: string
  gtin: string
  gtinIsRetailUnit: boolean
  mpn: string
  brand: string
  title: string
  slug: string

  // commerce — integer minor units
  priceCents: number | null
  inventory: number

  // grouping
  groupId: string
  isVariant: boolean
  variantLabel: string
  variantAxes: { type: string; value: string }[]

  // taxonomy
  categoryL1: string
  categoryLeaf: string
  googleProductCategory: string

  // content
  shortDescription: string
  descriptionText: string
  keyFeatures: { feature: string; detail?: string }[]
  specifications: { label: string; value: string; group?: string }[]

  // physical
  weightGrams: number | null

  // media
  imageUrls: string[]

  // reviews
  reviews: SourceReview[]
  sourceRating: number | null
  sourceReviewCount: number | null
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)

/**
 * A GTIN-14 whose leading indicator digit is not 0 identifies a CASE or PALLET,
 * not the retail unit a shopper buys. Merchant Center matches on retail-unit
 * identifiers, so sending one is a disapproval waiting to happen. We keep the
 * value but flag it so the import report can list them.
 */
const isRetailUnitGtin = (gtin: string): boolean => {
  if (!gtin) return false
  if (gtin.length !== 14) return true
  return gtin.startsWith('0')
}

/** "12.4 pounds" / "3.2 kg" / "890 g" → grams. */
export const parseWeightGrams = (raw: string): number | null => {
  if (!raw) return null
  const match = raw.match(/([\d.]+)\s*(pounds?|lbs?|oz|ounces?|kg|kilograms?|g|grams?)/i)
  if (!match) return null

  const value = Number(match[1])
  if (!Number.isFinite(value)) return null

  const unit = match[2]!.toLowerCase()
  if (unit.startsWith('pound') || unit.startsWith('lb')) return Math.round(value * 453.592)
  if (unit.startsWith('oz') || unit.startsWith('ounce')) return Math.round(value * 28.3495)
  if (unit.startsWith('kg') || unit.startsWith('kilogram')) return Math.round(value * 1000)
  return Math.round(value)
}

/** "Colour: Empire Red / Capacity: 5 quarts" → axes. */
export const parseVariantAxes = (raw: string): { type: string; value: string }[] =>
  raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [type, ...rest] = part.split(':')
      return { type: (type ?? '').trim(), value: rest.join(':').trim() }
    })
    // "unspecified" is noise from the source, not a real option.
    .filter((a) => a.type && a.value && a.value.toLowerCase() !== 'unspecified')

/** attributes_json keys are snake_case; make them presentable. */
const humanise = (key: string): string =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bD X W X H\b/i, 'Dimensions')
    .replace(/\bUpc\b/, 'UPC')

/** Keys already surfaced elsewhere, or not useful to a shopper. */
const SPEC_SKIP = new Set([
  'asin',
  'best_sellers_rank',
  'customer_reviews',
  'brand_name',
  'upc',
  'manufacturer_part_number',
  'model_number',
  // 40tag is not an authorized retailer for the brands it sells and cannot
  // promise their manufacturer warranties will be honored — every
  // warranty/guarantee claim on the site references the single 40tag
  // Guarantee instead (src/lib/commerce/guarantee.ts). A manufacturer
  // warranty term surfacing here as a spec row would contradict that.
  // Owner decision 2026-08-12.
  'manufacturer_warranty_description',
  'warranty_description',
  'warranty_type',
])

/** Same warranty exclusion, applied to a bullet's own label. */
const isWarrantyBullet = (label: string): boolean => /warrant/i.test(label)

/**
 * "Beverage Center, Manual, Warranty" -> "Beverage Center, Manual" — strips
 * a trailing comma-separated list item that names a warranty, without
 * touching the rest of a legitimate list (e.g. "In the box" contents).
 */
const stripTrailingWarrantyItem = (text: string): string =>
  text.replace(/,\s*[\w\s-]*warrant[\w\s-]*\.?$/i, '').trim()

export const mapRow = (table: CsvTable, row: string[]): MappedRow => {
  const get = (name: string, occurrence = 0) => cell(table, row, name, occurrence)

  const gtin = get('gtin')
  const newTitle = get('new_title') || get('title')
  const asin = get('asin')

  // Slug must be unique and stable. The ASIN is unique across the file, so it
  // is the uniqueness guarantee — which means it must survive truncation.
  //
  // Truncating the COMBINED string (as this originally did) cuts characters
  // off the ASIN on long titles, silently destroying uniqueness and leaving a
  // trailing `--`. Budget the length for the ASIN first, then trim the title.
  const asinPart = asin.toLowerCase()
  const titleBudget = Math.max(20, 100 - asinPart.length - 1)
  const titlePart = slugify(newTitle).slice(0, titleBudget).replace(/-+$/, '')
  const slug = asinPart ? `${titlePart}-${asinPart}` : titlePart

  const price = numberCell(table, row, 'recommended_price') ?? numberCell(table, row, 'price')

  // ---- content ----------------------------------------------------------
  const description = get('new_description')
  const shortDescription =
    description.length > 300 ? `${description.slice(0, 297).trimEnd()}…` : description

  const keyFeatures = get('new_bullets')
    .split('|')
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((bullet) => {
      const [label, ...rest] = bullet.split(':')
      return rest.length
        ? { feature: (label ?? '').trim(), detail: rest.join(':').trim() }
        : { feature: bullet }
    })
    // Drop bullets that ARE a warranty claim outright (feature: "Warranty").
    // A bullet whose label is something else (e.g. "Includes") but whose
    // detail mentions warranty as a trailing list item — "Manual, Warranty"
    // — gets the list item stripped instead, same as the SPEC_SKIP rule
    // above and for the same reason.
    .filter((f) => !isWarrantyBullet(f.feature))
    .map((f) =>
      f.detail ? { ...f, detail: stripTrailingWarrantyItem(f.detail) } : f,
    )

  // ---- specifications ---------------------------------------------------
  const attributes = jsonCell<Record<string, unknown>>(table, row, 'attributes_json', {})
  const specifications: { label: string; value: string; group?: string }[] = []
  const pushSpec = (label: string, value: string, group?: string) => {
    const clean = value?.toString().trim()
    if (!clean || specifications.some((s) => s.label === label)) return
    specifications.push({ label, value: clean, ...(group ? { group } : {}) })
  }

  // Explicit columns first — they are the cleanest values available.
  pushSpec('Weight', get('weight'), 'Dimensions')
  pushSpec('Dimensions', get('dimensions'), 'Dimensions')
  pushSpec('Capacity', get('capacity'), 'Dimensions')
  // Index 1 is the normalised variant-level value; index 0 is the raw one.
  pushSpec('Material', get('material', 1) || get('material'), 'Materials')
  pushSpec('Colour', get('color', 1) || get('color'), 'Materials')
  pushSpec('Pattern', get('pattern'), 'Materials')
  pushSpec('Size', get('size'), 'Dimensions')

  for (const [key, value] of Object.entries(attributes)) {
    if (SPEC_SKIP.has(key)) continue
    if (value === null || value === undefined) continue
    const text = Array.isArray(value) ? value.join(', ') : String(value)
    if (!text.trim() || text.length > 120) continue
    pushSpec(humanise(key), text, 'Details')
  }

  return {
    asin,
    gtin,
    gtinIsRetailUnit: isRetailUnitGtin(gtin),
    mpn: get('mpn'),
    brand: get('brand'),
    title: newTitle,
    slug,

    priceCents: price === null ? null : Math.round(price * 100),
    // The source has no stock figure. A conservative default keeps products
    // sellable without implying depth we do not have.
    inventory: 10,

    groupId: get('item_group_id'),
    isVariant: get('is_variant').toLowerCase() === 'true',
    variantLabel: get('variant_attributes'),
    variantAxes: parseVariantAxes(get('variant_attributes')),

    categoryL1: get('category_l1'),
    categoryLeaf: get('category_leaf'),
    googleProductCategory: get('google_category_id'),

    shortDescription,
    descriptionText: description,
    keyFeatures,
    specifications,

    weightGrams: parseWeightGrams(get('weight')),

    imageUrls: [get('primary_image'), ...get('image_urls').split(/[|,\s]+/)]
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u)),

    reviews: jsonCell<SourceReview[]>(table, row, 'reviews_json', []),
    sourceRating: numberCell(table, row, 'rating'),
    sourceReviewCount: numberCell(table, row, 'reviews_count'),
  }
}

/** "Reviewed in the United States July 8, 2026" → ISO date. */
export const parseReviewDate = (raw?: string): string | null => {
  if (!raw) return null
  const match = raw.match(/([A-Z][a-z]+ \d{1,2},? \d{4})/)
  if (!match) return null
  const parsed = new Date(match[1]!)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
