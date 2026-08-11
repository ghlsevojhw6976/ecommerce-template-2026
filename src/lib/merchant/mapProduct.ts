import type { Media, Product } from '@/payload-types'
import type { MappedProduct, MerchantMarket, MerchantProductInput } from './types'
import { getDiscount } from '@/lib/commerce/discount'

/**
 * Payload Product -> Merchant API v1 ProductInput.
 *
 * Pure and synchronous on purpose: every rule that decides what Google sees is
 * testable without credentials or a network. See tests/int/merchantMapper.*.
 */

/** Our prices are integer minor units (cents). Merchant API wants micros. */
export const CENTS_TO_MICROS = 10_000

/**
 * 2500 cents ($25.00) -> "25000000" micros.
 *
 * Getting this factor wrong is the single most expensive bug in the whole
 * integration — a 100x error either prices us at 1% (and we honour it) or
 * 10,000% (and we get disapproved). Hence its own named constant and test.
 */
export const centsToMicros = (cents: number): string =>
  String(Math.round(cents * CENTS_TO_MICROS))

const mediaUrl = (value: unknown, serverUrl: string): string | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const url = (value as Media).url
  if (!url) return undefined
  return url.startsWith('http') ? url : `${serverUrl}${url}`
}

export type MapProductArgs = {
  product: Product
  market: MerchantMarket
  serverUrl: string
}

/**
 * Reasons a product is withheld. Returned rather than thrown so a single bad
 * product never aborts a whole sync run — the summary reports it instead.
 */
export const SKIP_REASONS = {
  affiliate: 'fulfilment is affiliate — Google forbids affiliate links in Shopping',
  notEligible: 'feedEligible is false',
  excluded: 'manually excluded from feed',
  unpublished: 'not published',
  noPrice: 'no price set',
  noTitle: 'no title',
  noImage: 'no image — Merchant Center requires imageLink',
} as const

export const mapProduct = ({ product, market, serverUrl }: MapProductArgs): MappedProduct => {
  const offerId = product.slug || String(product.id)
  const skip = (reason: string): MappedProduct => ({ ok: false, offerId, reason })

  // --- Policy gates. Order matters: report the most specific reason. --------
  // Defence in depth. feedEligible is derived and already enforced by a hook,
  // but the mapper re-checks fulfilment directly so that a future refactor of
  // that hook cannot silently leak affiliate products into the feed.
  if (product.fulfilment === 'affiliate') return skip(SKIP_REASONS.affiliate)
  if (product.feedEligible === false) return skip(SKIP_REASONS.notEligible)
  if (product.excludeFromFeed) return skip(SKIP_REASONS.excluded)
  if (product._status !== 'published') return skip(SKIP_REASONS.unpublished)

  // --- Data completeness. Missing these means certain disapproval. ---------
  if (!product.title) return skip(SKIP_REASONS.noTitle)
  if (typeof product.priceInUSD !== 'number') return skip(SKIP_REASONS.noPrice)

  const images = (product.gallery ?? [])
    .map((item) => mediaUrl(item?.image, serverUrl))
    .filter((url): url is string => Boolean(url))

  if (images.length === 0) return skip(SKIP_REASONS.noImage)

  const [imageLink, ...additionalImageLinks] = images

  const inventory = typeof product.inventory === 'number' ? product.inventory : 0
  const supplier = typeof product.supplier === 'object' ? product.supplier : null

  // Dropship stock sits with the supplier, so inventory 0 is not a signal that
  // the item is unavailable — only an inactive supplier is.
  const availability =
    product.fulfilment === 'dropship'
      ? supplier?.status === 'paused'
        ? 'out_of_stock'
        : 'in_stock'
      : inventory > 0
        ? 'in_stock'
        : 'out_of_stock'

  const leadTime =
    product.leadTimeDaysOverride ?? supplier?.defaultLeadTimeDays ?? undefined

  const hasIdentifier = Boolean(product.gtin || product.mpn)

  const input: MerchantProductInput = {
    offerId,
    contentLanguage: market.contentLanguage,
    feedLabel: market.feedLabel,
    productAttributes: {
      title: product.title,
      // The CANONICAL product URL — Google fetches this page and compares
      // it against the feed; a wrong path here is a 404 on every offer and
      // catalogue-wide disapproval. (Was missing /products/ until the XML
      // feed surfaced it.)
      link: `${serverUrl}/products/${product.slug ?? ''}`,
      imageLink,
      availability,
      condition: (product.condition as 'new' | 'refurbished' | 'used') ?? 'new',
      price: {
        amountMicros: centsToMicros(product.priceInUSD),
        currencyCode: market.currencyCode,
      },
    },
  }

  const attrs = input.productAttributes

  // --- Sale pricing ---------------------------------------------------------
  // Google matches the on-page strikethrough against the feed's `price` and
  // the transacted amount against `salePrice`. So on sale, `price` becomes the
  // WAS-price and the charged `priceInUSD` moves to `salePrice` — the
  // Merchant-API-native shape, tolerant of sync lag: both prices are in the
  // feed for the whole window, so a boundary resync being hours late cannot
  // create a mismatched-price disapproval.
  const discount = getDiscount(product)
  if (discount) {
    attrs.price = {
      amountMicros: centsToMicros(discount.compareAt),
      currencyCode: market.currencyCode,
    }
    attrs.salePrice = {
      amountMicros: centsToMicros(discount.price),
      currencyCode: market.currencyCode,
    }
    // Interval only when an end date exists and is still ahead — a past window
    // would tell Google the sale is over while the page still shows it.
    if (discount.saleEndsAt && Date.parse(discount.saleEndsAt) > Date.now()) {
      attrs.salePriceEffectiveDate = {
        ...(product.saleStartedAt
          ? { startTime: new Date(product.saleStartedAt).toISOString() }
          : {}),
        endTime: new Date(discount.saleEndsAt).toISOString(),
      }
    }
  }

  if (additionalImageLinks.length) attrs.additionalImageLinks = additionalImageLinks
  // Same fallback chain as the page's own metadata (generateMeta.ts) — the
  // feed must not diverge from what Google's crawler sees on the page
  // itself. Without this, a fresh catalogue with zero hand-written SEO
  // meta (the expected state, per the same file's contract) submits every
  // product with NO description attribute at all.
  const feedDescription = product.meta?.description || product.shortDescription || undefined
  if (feedDescription) attrs.description = feedDescription
  if (product.brand) attrs.brand = product.brand
  if (product.gtin) attrs.gtins = [product.gtin]
  if (product.mpn) attrs.mpn = product.mpn
  // Variant families: every sibling is its own offer (own id/link/image/gtin)
  // sharing an item_group_id — the shape Google's spec mandates.
  if (product.itemGroupId) attrs.itemGroupId = product.itemGroupId
  if (product.color) attrs.color = product.color
  if (product.size) attrs.size = product.size
  if (product.googleProductCategory) attrs.googleProductCategory = product.googleProductCategory
  if (supplier?.shippingLabel) attrs.shippingLabel = supplier.shippingLabel

  // Only send identifierExists when it is false — Google treats absence as true,
  // and sending it needlessly on every product is noise.
  if (!hasIdentifier) attrs.identifierExists = false

  if (typeof leadTime === 'number') {
    attrs.minHandlingTime = String(leadTime)
    attrs.maxHandlingTime = String(leadTime)
  }

  return { ok: true, input }
}
