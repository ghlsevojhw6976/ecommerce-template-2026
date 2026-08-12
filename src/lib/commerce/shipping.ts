/**
 * Single source of truth for the shipping-cost formula: free at or above
 * Company.freeShippingThreshold, a flat Company.flatShippingFee below it.
 *
 * Every surface that charges, displays, or feeds this number — checkout
 * session creation, the cart drawer, the checkout review page, the
 * announcement bar, the homepage trust row, the product page reassurance
 * box, product JSON-LD, and the Merchant feed — calls this instead of
 * re-deriving it, so display and charge structurally cannot disagree (the
 * same discipline this project uses for discounts, see lib/commerce/discount.ts).
 *
 * All amounts are integer cents.
 */

export type ShippingPolicy = {
  /** Order total at/above which shipping is free. Missing/0 means always free. */
  freeShippingThreshold?: number | null
  /** Flat fee charged below the threshold. Missing/0 means always free. */
  flatShippingFee?: number | null
}

/** The charged shipping cost for a given order/product amount, in cents. */
export const shippingCostCents = (amountCents: number, policy: ShippingPolicy): number => {
  const threshold =
    typeof policy.freeShippingThreshold === 'number' ? policy.freeShippingThreshold : 0
  const fee = typeof policy.flatShippingFee === 'number' ? policy.flatShippingFee : 0

  if (fee <= 0) return 0
  return amountCents >= threshold ? 0 : fee
}

/** How many more cents an order needs to reach free shipping (0 if already free/no fee). */
export const centsToFreeShipping = (amountCents: number, policy: ShippingPolicy): number => {
  if (shippingCostCents(amountCents, policy) === 0) return 0
  const threshold =
    typeof policy.freeShippingThreshold === 'number' ? policy.freeShippingThreshold : 0
  return Math.max(0, threshold - amountCents)
}
