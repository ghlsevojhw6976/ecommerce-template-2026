import type { CollectionBeforeChangeHook, Field } from 'payload'

/**
 * Discount model: `priceInUSD` IS the charged price, always. A discount is
 * represented by lowering `priceInUSD` and recording the genuine former price
 * in `compareAtPriceInUSD`. Nothing anywhere computes an "effective price" —
 * every charge path (the plugin's cart subtotal hook, our Checkout Session
 * endpoint, the plugin's own mounted payment endpoint) reads the same column
 * the customer sees, so display and charge structurally cannot disagree.
 *
 * The was-price is DERIVED-GUARDED like `feedEligible`: a server-side hook
 * nulls it unless it is genuinely above the current price. A fake or
 * inverted compare-at cannot be persisted, whatever the admin UI is told.
 *
 * `saleStartedAt` is stamped automatically when a sale begins. It exists for
 * two auditors: the FTC/California §17501 reference-pricing rules (the
 * was-price must be genuine and recent — this proves when the base price was
 * last live) and Google's base-price validity windows for sale annotations.
 */

export const discountFields: Field[] = [
  {
    type: 'row',
    fields: [
      {
        name: 'compareAtPriceInUSD',
        type: 'number',
        min: 0,
        admin: {
          width: '50%',
          description:
            'Was-price in CENTS, shown struck through. Must be a genuine price this product was recently offered at (FTC / CA 90-day rule). Cleared automatically unless greater than the current price.',
        },
      },
      {
        name: 'saleEndsAt',
        type: 'date',
        admin: {
          width: '50%',
          date: { pickerAppearance: 'dayAndTime' },
          condition: (data) => typeof data?.compareAtPriceInUSD === 'number',
          description:
            'Optional. Shown as honest urgency and sent to Google as the sale window end. If set, the price must actually revert then.',
        },
      },
    ],
  },
  {
    name: 'saleStartedAt',
    type: 'date',
    admin: {
      readOnly: true,
      condition: (data) => typeof data?.compareAtPriceInUSD === 'number',
      description: 'Stamped automatically when the sale began — reference-pricing provenance.',
    },
  },
]

export const normalizeDiscount: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (!data) return data

  const price = data.priceInUSD
  const compareAt = data.compareAtPriceInUSD

  const valid =
    typeof price === 'number' && typeof compareAt === 'number' && compareAt > price && price > 0

  if (!valid) {
    // Whatever was submitted, an invalid was-price never persists — and its
    // companions go with it, so a cleared sale leaves no stale metadata.
    data.compareAtPriceInUSD = null
    data.saleEndsAt = null
    data.saleStartedAt = null
    return data
  }

  const hadSale = typeof originalDoc?.compareAtPriceInUSD === 'number'

  if (!hadSale) {
    // Sale begins now — stamp provenance.
    data.saleStartedAt = new Date().toISOString()
  } else if (!data.saleStartedAt) {
    data.saleStartedAt = originalDoc?.saleStartedAt ?? new Date().toISOString()
  }

  return data
}
