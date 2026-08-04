/**
 * The single source of discount truth for every surface: cards, PDP buy box,
 * cart drawer, checkout summary, JSON-LD and the Merchant Center mapper all
 * call `getDiscount` and render what it returns. No surface computes its own
 * savings — that is how badge, strike-through and feed drift apart.
 *
 * Input is any object carrying the two price fields (full Product docs,
 * defaultPopulate-stripped relation docs, cart line products). Prices are
 * integer CENTS, per the money convention.
 */

export type Discount = {
  /** Charged price, cents — always `priceInUSD`. */
  price: number
  /** The struck-through was-price, cents. */
  compareAt: number
  savingsCents: number
  /** Whole-number percent, rounded to nearest. */
  savingsPercent: number
  /** Card badge, percent-framed per shop style: "8% off". */
  badgeLabel: string
  /** Buy-box line: "You save $56.00 (8%)". */
  savingsLine: string
  /** RFC3339 string when an end date is set, else null. */
  saleEndsAt: string | null
}

type PricedLike = {
  priceInUSD?: number | null
  compareAtPriceInUSD?: number | null
  saleEndsAt?: string | null
  saleStartedAt?: string | null
}

const formatDollars = (cents: number): string => {
  const dollars = cents / 100
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export const getDiscount = (product: PricedLike | null | undefined): Discount | null => {
  if (!product) return null
  const price = product.priceInUSD
  const compareAt = product.compareAtPriceInUSD

  // Mirrors the normalizeDiscount persistence guard — belt and braces, since
  // stale drafts and external writers exist.
  if (typeof price !== 'number' || typeof compareAt !== 'number') return null
  if (!(compareAt > price) || price <= 0) return null

  const savingsCents = compareAt - price
  const savingsPercent = Math.round((savingsCents / compareAt) * 100)

  return {
    price,
    compareAt,
    savingsCents,
    savingsPercent,
    badgeLabel: `${savingsPercent}% off`,
    savingsLine: `You save ${formatDollars(savingsCents)} (${savingsPercent}%)`,
    saleEndsAt: product.saleEndsAt ?? null,
  }
}

/** Sum of savings across cart/checkout lines — the "Total savings" row. */
export const totalSavingsCents = (
  lines: { product: PricedLike | null | undefined; quantity: number }[],
): number =>
  lines.reduce((sum, line) => {
    const discount = getDiscount(line.product)
    return discount ? sum + discount.savingsCents * Math.max(0, line.quantity) : sum
  }, 0)

/**
 * Merchant Center annotation sanity — warnings for the feed preview, never
 * submission blockers (none of these make the payload invalid).
 */
export const gmcAnnotationWarnings = (product: PricedLike): string[] => {
  const warnings: string[] = []
  const discount = getDiscount(product)
  if (!discount) return warnings

  const ratio = discount.savingsCents / discount.compareAt
  if (ratio <= 0.05) {
    warnings.push(
      `Discount is ${(ratio * 100).toFixed(1)}% — Google's sale annotation requires greater than 5% off; the strikethrough will not show on Shopping.`,
    )
  } else if (ratio > 0.9) {
    warnings.push(
      `Discount is ${(ratio * 100).toFixed(0)}% — above Google's 90% ceiling; the sale price will be treated as suspect and the annotation dropped.`,
    )
  }

  if (product.saleEndsAt && Date.parse(product.saleEndsAt) < Date.now()) {
    warnings.push(
      'saleEndsAt is in the past — the sale should have been reverted; a stale sale price risks a mismatched-price disapproval.',
    )
  }

  if (product.saleStartedAt) {
    const ageDays = (Date.now() - Date.parse(product.saleStartedAt)) / 86_400_000
    if (ageDays > 90) {
      warnings.push(
        `Sale has run ${Math.floor(ageDays)} days — base-price validity windows (and the FTC/§17501 90-day reference-price rule) are in doubt; end the sale or make the sale price the regular price.`,
      )
    }
  }

  return warnings
}
