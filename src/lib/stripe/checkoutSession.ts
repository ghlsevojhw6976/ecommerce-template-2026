import type Stripe from 'stripe'

import type { PostalAddress } from '@/fields/postalAddress'

/**
 * Pure builders for the embedded Stripe Checkout session.
 *
 * Kept free of Payload and network so every parameter Stripe receives is
 * pinned by unit tests — the same discipline as the Merchant mapper's
 * cents→micros tests. The route handler owns I/O; this module owns shape.
 *
 * Field-name warning: everything here targets API version 2025-08-27.basil
 * (pinned in client.ts). The collected address lives at
 * `session.collected_information.shipping_details` on this version.
 */

export type SessionLineItemSource = {
  title: string
  /** Integer cents from Postgres — the project-wide money rule. */
  priceInUSD: number
  quantity: number
  /** Absolute HTTPS image URL, when one exists that Stripe can fetch. */
  imageUrl?: string
}

export type CartItemSnapshot = {
  product: number | string
  variant?: number | string
  quantity: number
}

/** Stripe caps metadata values at 500 characters — over that, omit, never truncate. */
export const METADATA_VALUE_LIMIT = 500

export const buildLineItems = (
  items: SessionLineItemSource[],
): Stripe.Checkout.SessionCreateParams.LineItem[] =>
  items.map((item) => ({
    quantity: item.quantity,
    price_data: {
      currency: 'usd',
      // Already integer minor units; no conversion, and a test pins that.
      unit_amount: item.priceInUSD,
      product_data: {
        name: item.title,
        // Stripe fetches these server-side: a localhost URL renders as a
        // broken image on their page, so the caller only passes public HTTPS.
        ...(item.imageUrl ? { images: [item.imageUrl] } : {}),
      },
    },
  }))

export const buildSessionParams = ({
  lineItems,
  origin,
  cartID,
  itemsSnapshot,
  customerEmail,
  cancelPath = '/checkout',
  shippingAmount,
}: {
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[]
  origin: string
  cartID: number | string
  itemsSnapshot: CartItemSnapshot[]
  customerEmail?: string
  /**
   * Where Stripe's back button lands. Cart checkouts return to the review
   * page; Buy now returns to the product the customer was looking at —
   * landing them on a review of a cart that never contained the item they
   * clicked would read as the shop losing their order.
   */
  cancelPath?: string
  /**
   * Integer cents, computed server-side by the caller from
   * lib/commerce/shipping.ts against the trusted cart subtotal — never
   * client input. 0 renders as "Free shipping"; anything else as a flat
   * rate, both as an explicit line on Stripe's summary rather than an
   * unexplained absence of one.
   */
  shippingAmount: number
}): Stripe.Checkout.SessionCreateParams => {
  // Mirrors the metadata contract the PaymentIntent flow used, so
  // ensureOrderForPaymentIntent's rebuild path works unchanged. Oversized
  // snapshots are OMITTED rather than truncated: ensureOrder falls back to the
  // transaction row's items, and this turns what used to be a hard checkout
  // failure at ~11-16 line items into a non-event.
  const serialized = JSON.stringify(itemsSnapshot)

  return {
    mode: 'payment',
    // No ui_mode: hosted (the full checkout.stripe.com page) is the default,
    // and the owner explicitly chose it. Stripe substitutes the session id
    // into success_url on the way back; cancel_url renders a back button on
    // Stripe's page that returns the customer to the review step.
    success_url: `${origin}/checkout/confirm-order?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${cancelPath}`,

    // Stripe collects the delivery address — with Google autocomplete — and
    // the phone number. This replaces the entire address UI this shop used to
    // maintain, and closes the long-open "collect the customer's phone" item.
    shipping_address_collection: { allowed_countries: ['US'] },
    phone_number_collection: { enabled: true },

    ...(customerEmail ? { customer_email: customerEmail } : {}),

    // Free at/above the threshold, a flat fee below it — computed by the
    // caller from the SAME formula the cart drawer, checkout review page and
    // product page quote, so what Stripe charges can never contradict what
    // the customer was shown before reaching this page.
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shippingAmount, currency: 'usd' },
          display_name: shippingAmount === 0 ? 'Free shipping' : 'Flat rate shipping',
        },
      },
    ],
    custom_text: {
      shipping_address: {
        message:
          'Duties and import taxes are included in your total — nothing to pay at delivery.',
      },
    },

    line_items: lineItems,

    payment_intent_data: {
      metadata: {
        cartID: String(cartID),
        ...(serialized.length <= METADATA_VALUE_LIMIT ? { cartItemsSnapshot: serialized } : {}),
      },
    },
  }
}

/**
 * The Stripe-collected address → our PostalAddress shape.
 *
 * basil: shipping lives at `collected_information.shipping_details`
 * ({name, address}); email/phone live in `customer_details`. The name arrives
 * as one string — split on the last space so "Mary Jo Smith" keeps her double
 * first name rather than gaining a double last one.
 */
export const sessionShippingToPostal = (
  session: Pick<Stripe.Checkout.Session, 'collected_information' | 'customer_details'>,
): PostalAddress | undefined => {
  const shipping = session.collected_information?.shipping_details
  if (!shipping?.address?.line1) return undefined

  const fullName = (shipping.name ?? session.customer_details?.name ?? '').trim()
  const lastSpace = fullName.lastIndexOf(' ')
  const firstName = lastSpace > 0 ? fullName.slice(0, lastSpace) : fullName
  const lastName = lastSpace > 0 ? fullName.slice(lastSpace + 1) : ''

  return {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    addressLine1: shipping.address.line1 ?? undefined,
    addressLine2: shipping.address.line2 ?? undefined,
    city: shipping.address.city ?? undefined,
    state: shipping.address.state ?? undefined,
    postalCode: shipping.address.postal_code ?? undefined,
    country: shipping.address.country ?? undefined,
    phone: session.customer_details?.phone ?? undefined,
  }
}
