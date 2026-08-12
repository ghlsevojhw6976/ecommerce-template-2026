import crypto from 'crypto'

import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import {
  buildLineItems,
  buildSessionParams,
  type CartItemSnapshot,
  type SessionLineItemSource,
} from '@/lib/stripe/checkoutSession'
import { createBuyNowCart } from '@/lib/commerce/buyNowCart'
import { revivePurchasedCart } from '@/lib/commerce/reviveCart'
import { shippingCostCents } from '@/lib/commerce/shipping'
import { validateProducts } from '@/lib/commerce/validateProducts'
import { getStripe } from '@/lib/stripe/client'
import { ensureStripeCredentialsLoaded } from '@/lib/stripe/keys'
import { getServerSideURL } from '@/utilities/getURL'
import { getCompany } from '@/utilities/getCompany'

/**
 * Creates the hosted Checkout Session for a cart and returns the
 * checkout.stripe.com URL to redirect the customer to.
 *
 * Server-authoritative by construction: every unit_amount is read from
 * Postgres inside this handler — nothing about money is taken from the
 * request. The browser contributes only WHICH cart, plus the secret proving
 * it may spend it.
 *
 * Cart authorisation: guests hold a high-entropy cart secret (issued by the
 * plugin at cart creation and stored in localStorage); logged-in customers
 * own their cart row. One or the other must hold, or the answer is 404 —
 * indistinguishable from the cart not existing, exactly like the plugin's own
 * endpoints behave.
 */

type SessionResponse = {
  url?: string
  message?: string
  /**
   * Present when the cart the client sent was already purchased and its items
   * were carried into a fresh cart — the client must adopt this identity
   * (localStorage) before redirecting, or it will keep resurrecting the dead
   * cart forever.
   */
  replacedCart?: { id: number | string; secret?: string }
}

const json = (body: SessionResponse, status = 200) => Response.json(body, { status })

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config })
  await ensureStripeCredentialsLoaded(payload)

  const stripe = getStripe()
  if (!stripe) return json({ message: 'Payments are not configured.' }, 503)

  let cartID: unknown
  let cartSecret: unknown
  let buyNow: unknown

  try {
    const body = await request.json()
    cartID = body?.cartID
    cartSecret = body?.cartSecret
    buyNow = body?.buyNow
  } catch {
    return json({ message: 'Invalid request body.' }, 400)
  }

  const { user } = await payload.auth({ headers: await headers() })

  let cart2: Record<string, any>
  let replacedCart: SessionResponse['replacedCart']
  // Where Stripe's back button lands — the review page for cart checkouts,
  // the product page for Buy now.
  let cancelPath = '/checkout'

  if (buyNow && typeof buyNow === 'object') {
    // ---- Buy now: THIS item only, through an ephemeral cart ---------------
    // The customer's real cart is never read, never spent, never modified.
    const request_ = buyNow as { product?: unknown; quantity?: unknown }
    const productID = request_.product
    const quantity = Number(request_.quantity ?? 1)

    if (
      (typeof productID !== 'string' && typeof productID !== 'number') ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return json({ message: 'Invalid request body.' }, 400)
    }

    try {
      const buyNowResult = await createBuyNowCart({ payload, productID, quantity })
      cart2 = buyNowResult.cart
      if (buyNowResult.productSlug) cancelPath = `/products/${buyNowResult.productSlug}`
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'This product is not available right now.'
      return json({ message }, 400)
    }
  } else {
    if (typeof cartID !== 'string' && typeof cartID !== 'number') {
      return json({ message: 'A cart is required.' }, 400)
    }

    // ---- Load and authorise the cart -------------------------------------
    // overrideAccess so the secret (field access read:false) is comparable —
    // which makes the manual check below THE access control. Fail as 404
    // either way: revealing "exists but not yours" invites enumeration.
    const cart = (await payload
      .findByID({ collection: 'carts', id: cartID, depth: 0, overrideAccess: true })
      .catch(() => null)) as Record<string, any> | null

    if (!cart) return json({ message: 'Cart not found.' }, 404)

    const ownerID =
      cart.customer && typeof cart.customer === 'object' ? cart.customer.id : cart.customer
    const isOwner = Boolean(user && ownerID && String(ownerID) === String(user.id))

    const secretMatches = Boolean(
      typeof cartSecret === 'string' &&
        cartSecret.length > 0 &&
        typeof cart.secret === 'string' &&
        cart.secret.length === cartSecret.length &&
        crypto.timingSafeEqual(Buffer.from(cartSecret), Buffer.from(cart.secret)),
    )

    if (!isOwner && !secretMatches) return json({ message: 'Cart not found.' }, 404)

    // A purchased cart is never charged again — but the customer holding its
    // id is not at fault (they paid and closed the tab before the return
    // page, or paid on another device). Self-heal: carry their CURRENT items
    // into a fresh cart and proceed with that. The old cart stays as the
    // immutable record its order references.
    cart2 = cart

    if (cart.purchasedAt) {
      const revived = await revivePurchasedCart({ payload, cart })
      cart2 = revived.cart
      replacedCart = {
        id: revived.cart.id,
        ...(revived.secret ? { secret: revived.secret } : {}),
      }
    }
  }

  const items = Array.isArray(cart2.items) ? cart2.items : []
  if (!items.length) return json({ message: 'Your cart is empty.' }, 400)

  // ---- Price and validate every line from Postgres -----------------------
  const origin = getServerSideURL().replace(/\/$/, '')
  // Stripe fetches product images server-side; a localhost URL renders as a
  // broken square on their form, so images only ship from public HTTPS.
  const publicOrigin = origin.startsWith('https://') ? origin : null

  const lineSources: SessionLineItemSource[] = []
  const snapshot: CartItemSnapshot[] = []
  let amount = 0

  for (const item of items) {
    const productID = typeof item.product === 'object' ? item.product?.id : item.product
    const quantity = Number(item.quantity ?? 0)

    // Colour/size siblings are separate products; a legacy cart item still
    // pointing at a plugin variant references a retired model and cannot be
    // priced honestly — treat it as unavailable.
    if (item.variant) {
      return json({ message: 'An item in your cart is no longer available.' }, 400)
    }

    const product = (await payload
      .findByID({ collection: 'products', id: productID, depth: 1 })
      .catch(() => null)) as Record<string, any> | null

    if (!product) return json({ message: 'An item in your cart is no longer available.' }, 400)

    try {
      validateProducts({ product: product as never, quantity })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An item in your cart is not available.'
      return json({ message }, 400)
    }

    const unitPrice: number = product.priceInUSD

    const galleryImage = product.gallery?.[0]?.image
    const imagePath =
      galleryImage && typeof galleryImage === 'object' ? (galleryImage.url as string) : undefined
    const imageUrl =
      publicOrigin && imagePath?.startsWith('/') ? `${publicOrigin}${imagePath}` : undefined

    lineSources.push({
      title: product.title,
      priceInUSD: unitPrice,
      quantity,
      imageUrl,
    })

    snapshot.push({ product: productID, quantity })
    amount += unitPrice * quantity
  }

  // ---- Shipping, from the trusted server-computed subtotal ---------------
  // Same formula the cart drawer, checkout review page and product pages
  // quote (lib/commerce/shipping.ts) — never re-derived here.
  const company = await getCompany()
  const shippingAmount = shippingCostCents(amount, company)
  const totalAmount = amount + shippingAmount

  // ---- Reuse an open session instead of minting duplicates ---------------
  // A refresh or double-click lands here again; an unchanged cart gets its
  // existing session back, a changed one expires the stale session so the
  // customer can never pay a stale total.
  const pending = await payload.find({
    collection: 'transactions',
    depth: 0,
    limit: 1,
    sort: '-createdAt',
    where: {
      and: [
        { cart: { equals: cart2.id } },
        { status: { equals: 'pending' } },
        { 'stripe.checkoutSessionID': { exists: true } },
      ],
    },
  })

  const previous = pending.docs[0] as Record<string, any> | undefined
  const previousSessionID = previous?.stripe?.checkoutSessionID as string | undefined

  if (previous && previousSessionID) {
    const existing = await stripe.checkout.sessions
      .retrieve(previousSessionID)
      .catch(() => null)

    if (existing && existing.status === 'open') {
      // amount_total is Stripe's own total INCLUDING the shipping option, so
      // it must be compared against totalAmount, not the bare item subtotal —
      // otherwise every session with a nonzero shipping fee looks "stale" and
      // gets needlessly re-created on every page load.
      if (existing.amount_total === totalAmount && existing.url) {
        return json({ url: existing.url, ...(replacedCart ? { replacedCart } : {}) })
      }

      // Cart changed since the session was created — the old total is wrong.
      await stripe.checkout.sessions.expire(previousSessionID).catch(() => undefined)
      await payload
        .update({
          collection: 'transactions',
          id: previous.id,
          data: { status: 'cancelled' } as never,
        })
        .catch(() => undefined)
    }
  }

  // ---- Create the session and its pending transaction --------------------
  const params = buildSessionParams({
    lineItems: buildLineItems(lineSources),
    origin,
    cartID: cart2.id,
    itemsSnapshot: snapshot,
    customerEmail: user?.email,
    cancelPath,
    shippingAmount,
  })

  let session
  try {
    session = await stripe.checkout.sessions.create(params)
  } catch (error) {
    payload.logger.error({ err: error, cartId: cart2.id }, 'Failed to create Checkout Session')
    return json({ message: 'Could not start the payment. Please try again.' }, 502)
  }

  if (!session.url) {
    payload.logger.error({ sessionId: session.id }, 'Hosted session returned no URL')
    return json({ message: 'Could not start the payment. Please try again.' }, 502)
  }

  await payload.create({
    collection: 'transactions',
    data: {
      // The full charged total (subtotal + shipping), not the bare item
      // subtotal — reconcile.ts and the single-transaction repair action
      // both compare this directly against Stripe's real PaymentIntent
      // amount, which itself includes the shipping line.
      amount: totalAmount,
      currency: 'USD',
      cart: cart2.id,
      items: snapshot,
      paymentMethod: 'stripe',
      status: 'pending',
      ...(user ? { customer: user.id, customerEmail: user.email } : {}),
      stripe: { checkoutSessionID: session.id },
    } as never,
  })

  return json({ url: session.url, ...(replacedCart ? { replacedCart } : {}) })
}
