import type { Payload } from 'payload'
import type { Product } from '@/payload-types'

/**
 * Content-based product recommendations — the automatic engine behind
 * "More to consider" on product pages and "You may also like" after purchase.
 *
 * Deliberately rule-based, not behavioural: this catalogue has exactly one
 * real multi-item order, so any "customers also bought" would be a fabricated
 * claim. What the data DOES support (measured on the live catalogue):
 *
 *   - same LEAF category fills a 4-slot row for 65% of products; falling back
 *     to the PARENT category lifts that to 97%
 *   - a same-category product at 1.1–2× the price exists for 96% of products
 *     — that is the upsell, ranked into the row rather than a separate widget
 *   - ratings exist on 380/382 products for ordering
 *
 * Curation always wins: a populated `relatedProducts` field replaces the
 * automatic row entirely. The default engine being automatic is what makes
 * this template work on FUTURE shops — a curation-dependent row ships empty
 * on every new deploy.
 */

const MIN_FILL = 4

type Candidate = Product & { ratingCount?: number | null; ratingAverage?: number | null }

const score = (product: Candidate): number =>
  (product.ratingAverage ?? 0) * Math.log1p(product.ratingCount ?? 0)

/** One representative per variant family — a row of colourways is not a row of alternatives. */
const dedupeFamilies = (products: Candidate[], excludeGroupId?: string | null): Candidate[] => {
  const seenGroups = new Set<string>()
  const result: Candidate[] = []

  for (const product of products) {
    const group = product.itemGroupId ?? null
    if (group) {
      if (group === excludeGroupId) continue
      if (seenGroups.has(group)) continue
      seenGroups.add(group)
    }
    result.push(product)
  }

  return result
}

const categoryIdOf = (product: Product): number | string | undefined => {
  const first = Array.isArray(product.categories) ? product.categories[0] : undefined
  if (!first) return undefined
  return typeof first === 'object' ? first.id : first
}

const fetchByCategories = async (
  payload: Payload,
  categoryIds: (number | string)[],
  excludeId: number | string,
  limit: number,
): Promise<Candidate[]> => {
  if (!categoryIds.length) return []

  const { docs } = await payload.find({
    collection: 'products',
    depth: 1,
    limit,
    pagination: false,
    sort: '-ratingCount',
    where: {
      and: [
        { categories: { in: categoryIds } },
        { _status: { equals: 'published' } },
        { id: { not_equals: excludeId } },
      ],
    },
  })

  return docs as Candidate[]
}

/**
 * Resolve curated relation entries to FULL published product docs.
 *
 * Resolved relationship objects on products pass through `defaultPopulate`,
 * which strips them to a handful of fields — no `_status`, no `title` — so
 * they can neither be trusted as published nor rendered as tiles. The ids are
 * real; the documents must be re-fetched.
 */
const resolveCurated = async (
  payload: Payload,
  entries: Product['relatedProducts'],
  limit: number,
): Promise<Product[]> => {
  const ids: (number | string)[] = (entries ?? [])
    .map((entry) => (entry && typeof entry === 'object' ? entry.id : entry))
    .filter((id) => id !== null && id !== undefined)

  if (!ids.length) return []

  const { docs } = await payload.find({
    collection: 'products',
    depth: 1,
    limit: ids.length,
    pagination: false,
    where: { and: [{ id: { in: ids } }, { _status: { equals: 'published' } }] },
  })

  // Preserve the curator's ordering — it is a merchandising decision.
  const byId = new Map(docs.map((doc) => [String(doc.id), doc as Product]))
  return ids
    .map((id) => byId.get(String(id)))
    .filter((doc): doc is Product => Boolean(doc))
    .slice(0, limit)
}

export const getAlternatives = async ({
  payload,
  product,
  limit = 8,
}: {
  payload: Payload
  product: Product
  limit?: number
}): Promise<Product[]> => {
  // ---- Curated override --------------------------------------------------
  const curated = await resolveCurated(payload, product.relatedProducts, limit)
  if (curated.length) return curated

  // ---- Automatic: leaf category, parent fallback -------------------------
  const leafId = categoryIdOf(product)
  if (!leafId) return []

  let pool = await fetchByCategories(payload, [leafId], product.id, limit * 3)

  if (dedupeFamilies(pool, product.itemGroupId).length < MIN_FILL) {
    // The leaf is too small (median leaf holds 2 products) — widen to the
    // parent category's whole subtree.
    const leaf = await payload
      .findByID({ collection: 'categories', id: leafId, depth: 0 })
      .catch(() => null)
    const parentId =
      leaf && leaf.parent ? (typeof leaf.parent === 'object' ? leaf.parent.id : leaf.parent) : null

    if (parentId) {
      const children = await payload.find({
        collection: 'categories',
        depth: 0,
        limit: 0,
        pagination: false,
        where: { parent: { equals: parentId } },
      })
      const subtree = [parentId, ...children.docs.map((child) => child.id)]
      pool = await fetchByCategories(payload, subtree, product.id, limit * 4)
    }
  }

  const deduped = dedupeFamilies(pool, product.itemGroupId).sort((a, b) => score(b) - score(a))

  // ---- Rank the premium alternative in --------------------------------
  // The upsell: same pool, 1.1–2× the price — "the step up" for a considered
  // buyer. Guaranteed a slot near the front rather than left to rating luck.
  const price = product.priceInUSD
  if (typeof price === 'number' && price > 0) {
    const premiumIndex = deduped.findIndex(
      (candidate) =>
        typeof candidate.priceInUSD === 'number' &&
        candidate.priceInUSD >= price * 1.1 &&
        candidate.priceInUSD <= price * 2,
    )

    if (premiumIndex > 1) {
      const [premium] = deduped.splice(premiumIndex, 1)
      deduped.splice(1, 0, premium!)
    }
  }

  return deduped.slice(0, limit)
}

/**
 * Post-purchase recommendations for an order — curated accessories of the
 * purchased items first (compatibility-guaranteed), topped up with automatic
 * alternatives seeded from the priciest item.
 */
export const getPostPurchase = async ({
  payload,
  productIds,
  limit = 4,
}: {
  payload: Payload
  /**
   * IDS of the purchased products, not resolved docs: relation-resolved
   * product objects pass through defaultPopulate and arrive without
   * categories/relatedProducts — this function fetches its own full docs.
   */
  productIds: (number | string)[]
  limit?: number
}): Promise<{ items: Product[]; curated: boolean }> => {
  if (!productIds.length) return { items: [], curated: false }

  const { docs } = await payload.find({
    collection: 'products',
    depth: 1,
    limit: productIds.length,
    pagination: false,
    where: { and: [{ id: { in: productIds } }, { _status: { equals: 'published' } }] },
  })
  const products = docs as Product[]

  const purchasedIds = new Set(products.map((product) => String(product.id)))

  const curatedAll = await resolveCurated(
    payload,
    products.flatMap((product) => product.relatedProducts ?? []),
    limit * 2,
  )
  const curated = curatedAll.filter(
    (candidate, index) =>
      !purchasedIds.has(String(candidate.id)) &&
      curatedAll.findIndex((other) => String(other.id) === String(candidate.id)) === index,
  )

  if (curated.length >= limit) return { items: curated.slice(0, limit), curated: true }

  const seed = [...products].sort((a, b) => (b.priceInUSD ?? 0) - (a.priceInUSD ?? 0))[0]
  if (!seed) return { items: curated, curated: curated.length > 0 }

  const alternatives = (await getAlternatives({ payload, product: seed, limit: limit * 2 })).filter(
    (candidate) =>
      !purchasedIds.has(String(candidate.id)) &&
      !curated.some((existing) => String(existing.id) === String(candidate.id)),
  )

  return {
    items: [...curated, ...alternatives].slice(0, limit),
    curated: curated.length > 0,
  }
}
