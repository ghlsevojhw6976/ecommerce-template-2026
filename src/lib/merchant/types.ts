/**
 * Merchant API v1 wire types.
 *
 * Deliberately hand-written rather than pulled from the client library: these
 * are the only fields we send, and having them explicit makes the mapper's
 * output reviewable in a diff. The client library's generated types are far
 * wider and mostly optional, which hides mistakes.
 *
 * ⚠️ v1 nests everything under `productAttributes`. v1beta used `attributes`,
 * and most sample code online still shows the old shape.
 */

/** 1 unit of currency = 1,000,000 micros. Sent as a string — it is an int64. */
export type MerchantPrice = {
  amountMicros: string
  currencyCode: string
}

/**
 * RFC3339 UTC Zulu timestamps. ⚠️ `startTime` is INCLUSIVE, `endTime` is
 * EXCLUSIVE — do not port the legacy feed-text "ends 11:59 PM" semantics or
 * every sale ends a day early/late.
 */
export type MerchantInterval = {
  startTime?: string
  endTime?: string
}

export type MerchantProductAttributes = {
  title: string
  description?: string
  link: string
  imageLink?: string
  additionalImageLinks?: string[]
  availability: 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder'
  condition: 'new' | 'refurbished' | 'used'
  /** On sale this is the WAS-price (compareAt) — the charged price moves to `salePrice`. */
  price: MerchantPrice
  salePrice?: MerchantPrice
  salePriceEffectiveDate?: MerchantInterval
  brand?: string
  /**
   * ARRAY, not singular: Merchant API products_v1 has only `gtins` (max 10) —
   * the singular `gtin` field of the old Content API does not exist in v1 and
   * would be rejected. We always send exactly one.
   */
  gtins?: string[]
  mpn?: string
  identifierExists?: boolean
  googleProductCategory?: string
  shippingLabel?: string
  /** Shared across colour/size sibling products — how Google groups variants. */
  itemGroupId?: string
  color?: string
  size?: string
  minHandlingTime?: string
  maxHandlingTime?: string
}

export type MerchantProductInput = {
  /** Our stable identifier. Combined with the two below it forms the product key. */
  offerId: string
  contentLanguage: string
  feedLabel: string
  productAttributes: MerchantProductAttributes
}

/** One (feedLabel, contentLanguage) target. Each needs its own API data source. */
export type MerchantMarket = {
  feedLabel: string
  contentLanguage: string
  currencyCode: string
  /** accounts/{account}/dataSources/{id} — filled in once the source exists. */
  dataSource?: string
}

export type MappedProduct =
  | { ok: true; input: MerchantProductInput }
  | { ok: false; offerId: string; reason: string }
