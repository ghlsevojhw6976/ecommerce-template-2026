import type { Payload } from 'payload'
import type Stripe from 'stripe'

import { isDispatchable } from '@/fields/postalAddress'
import { sessionShippingToPostal } from './checkoutSession'
import { ensureOrderForPaymentIntent, type EnsureOrderResult } from './ensureOrder'

/**
 * The one idempotent fulfilment function for a Checkout Session — Stripe's
 * required pattern, because payment completion has THREE messengers and any
 * of them can arrive first, twice, or not at all:
 *
 *   - the `checkout.session.completed` webhook (canonical)
 *   - the `checkout.session.async_payment_succeeded` webhook (delayed methods)
 *   - the customer landing on the return page (fast path — never the only one)
 *
 * All three call this. Steps:
 *
 *   1. Refuse anything not actually paid (`payment_status === 'unpaid'`).
 *   2. Find our transaction by `stripe.checkoutSessionID` and stamp what only
 *      exists after confirmation: the PaymentIntent id (created lazily by
 *      Checkout), the customer's email, and the Stripe-collected shipping
 *      address (basil: `collected_information.shipping_details`).
 *   3. Hand over to `ensureOrderForPaymentIntent`, whose `transaction.order`
 *      guard makes every duplicate call converge on the same single order.
 *
 * Session-first transactions are never touched by `enrichStripeTransaction`
 * (it fires on create only, and these rows are created before any PI exists) —
 * the address persistence that hook did for the old flow happens here instead,
 * from Stripe's own collected data, which is strictly more trustworthy than
 * the metadata snapshot it used to parse.
 */
export const fulfillCheckoutSession = async ({
  payload,
  stripe,
  session,
}: {
  payload: Payload
  stripe: Stripe
  session: Stripe.Checkout.Session
}): Promise<EnsureOrderResult & { transactionFound?: boolean; cartID?: number | string }> => {
  if (session.payment_status === 'unpaid') {
    return {
      created: false,
      reason: 'Session is not paid yet (async payment method) — awaiting async_payment_succeeded.',
    }
  }

  const found = await payload.find({
    collection: 'transactions',
    depth: 0,
    limit: 1,
    where: { 'stripe.checkoutSessionID': { equals: session.id } },
  })

  const transaction = found.docs[0] as Record<string, any> | undefined

  if (!transaction) {
    return {
      created: false,
      reason: 'No local transaction for this Checkout Session — not created by this shop.',
      transactionFound: false,
    }
  }

  const paymentIntentID =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id

  if (!paymentIntentID) {
    // Paid but no PI would be a Stripe invariant violation; log loudly.
    payload.logger.error(
      { sessionId: session.id, transactionId: transaction.id },
      'Checkout Session reports paid but carries no PaymentIntent',
    )
    return { created: false, reason: 'Paid session has no PaymentIntent.', transactionFound: true }
  }

  // ---- Stamp completion data onto the transaction ------------------------
  const shippingAddress = sessionShippingToPostal(session)
  const customerEmail = session.customer_details?.email ?? undefined

  const stamp: Record<string, unknown> = {
    stripe: {
      ...(transaction.stripe ?? {}),
      paymentIntentID,
    },
  }
  // Gate on COMPLETENESS, not truthiness — the group field materialises as an
  // object with null members, and a half-address must not shadow a usable one.
  if (isDispatchable(shippingAddress)) stamp.shippingAddress = shippingAddress
  if (customerEmail && !transaction.customerEmail) stamp.customerEmail = customerEmail

  await payload.update({
    collection: 'transactions',
    id: transaction.id,
    data: stamp as never,
    // The enrichment hook only reacts to creates, but be explicit anyway.
    context: { skipStripeEnrichment: true },
  })

  // ---- Converge on the idempotent order path -----------------------------
  const paymentIntent =
    typeof session.payment_intent === 'object' && session.payment_intent
      ? session.payment_intent
      : await stripe.paymentIntents.retrieve(paymentIntentID)

  const result = await ensureOrderForPaymentIntent({
    payload,
    paymentIntent,
    source: 'checkout',
  })

  // Which cart this payment actually spent — the client uses it to decide
  // whether to clear ITS cart. A Buy now purchase spends an ephemeral cart;
  // wiping the customer's real cart over it would delete a cart they still
  // want.
  const cartID =
    transaction.cart && typeof transaction.cart === 'object'
      ? transaction.cart.id
      : transaction.cart

  return { ...result, transactionFound: true, ...(cartID ? { cartID } : {}) }
}
