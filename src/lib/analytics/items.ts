/**
 * GA4 item shapes and builders — server-safe (no 'use client'), because the
 * PDP and the confirm endpoint build payloads during server render while the
 * funnel components build them in the browser. One builder, one money
 * conversion, wherever the call happens.
 *
 * Invariants:
 * - Money: our prices are integer CENTS; GA4 wants decimal currency units.
 *   `centsToGa` is the only conversion.
 * - item_id = the product's numeric database id (as a string) — the same
 *   key the Merchant feed uses as offerId, which lets GA4, Google Ads and
 *   Shopping reports join on one identifier. NOT the slug: slugs are long
 *   (this catalogue's run 20–100+ chars) and Google's Merchant `id`
 *   attribute has a hard 50-character cap — using the slug there fails
 *   validation across most of a real catalogue. The id is also more
 *   correct than the slug ever was for this purpose regardless of length:
 *   Google explicitly treats a changed `id` as a NEW item (losing the old
 *   one's history), and slugs get edited during ordinary catalogue
 *   maintenance (title fixes, SEO tweaks) — the database id never does.
 */

export type GaItem = {
  item_id: string
  item_name: string
  price: number
  quantity: number
  item_brand?: string
  item_category?: string
  discount?: number
}

export type GaPurchase = {
  transaction_id: string
  value: number
  currency: string
  items: GaItem[]
}

export const centsToGa = (cents: number): number => Math.round(cents) / 100

type ProductLike = {
  slug?: string | null
  id?: number | string
  title?: string | null
  priceInUSD?: number | null
  compareAtPriceInUSD?: number | null
  brand?: string | null
  categories?: unknown
}

/** Build a GA4 item from a product doc (full or defaultPopulate-stripped). */
export const gaItem = (product: ProductLike, quantity = 1): GaItem => {
  const price = typeof product.priceInUSD === 'number' ? product.priceInUSD : 0
  const compareAt = product.compareAtPriceInUSD

  const firstCategory = Array.isArray(product.categories) ? product.categories[0] : undefined
  const categoryTitle =
    firstCategory && typeof firstCategory === 'object' && 'title' in firstCategory
      ? (firstCategory as { title?: string }).title
      : undefined

  return {
    item_id: String(product.id ?? product.slug ?? ''),
    item_name: product.title ?? '',
    price: centsToGa(price),
    quantity,
    ...(product.brand ? { item_brand: product.brand } : {}),
    ...(categoryTitle ? { item_category: categoryTitle } : {}),
    ...(typeof compareAt === 'number' && compareAt > price
      ? { discount: centsToGa(compareAt - price) }
      : {}),
  }
}

export const itemsValue = (items: GaItem[]): number =>
  Math.round(items.reduce((sum, item) => sum + item.price * 100 * item.quantity, 0)) / 100
