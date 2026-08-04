import config from '@payload-config'
import { getPayload } from 'payload'

import { orderToGaPurchase } from '@/lib/analytics/purchase'
import type { GaPurchase } from '@/lib/analytics/items'
import { getStripe } from '@/lib/stripe/client'
import { ensureOrderForPaymentIntent } from '@/lib/stripe/ensureOrder'
import { fulfillCheckoutSession } from '@/lib/stripe/fulfillSession'
import { ensureStripeCredentialsLoaded } from '@/lib/stripe/keys'

/**
 * The single payment-completion endpoint.
 *
 * Both checkout paths land here after Stripe accepts the payment — the
 * in-page flow (card, no redirect) and the redirect flow (Klarna, Affirm,
 * Cash App, 3DS). It replaces the plugin's `/api/payments/stripe/confirm-order`,
 * which this project no longer calls from anywhere, for three reasons found
 * in its source:
 *
 * 1. It has NO idempotency guard — two calls with one PaymentIntent create two
 *    orders and decrement stock twice. Ours goes through
 *    `ensureOrderForPaymentIntent`, whose `transaction.order` check makes
 *    retries, double-clicks and webhook races all converge on one order.
 * 2. It throws when `customerEmail` is absent, which the redirect-return page
 *    never sent — every guest paying by a redirect method got a 400 after
 *    their money was taken.
 * 3. It requires the client's cart state to still exist. A redirect can
 *    outlive the cart cookie; the money does not care.
 *
 * Trust model: the caller supplies only a PaymentIntent id. Everything that
 * matters — status, amount, cart snapshot, addresses — is read from Stripe
 * and our own transaction row, so a forged request cannot invent a paid
 * order. Knowing a PI id already implies being party to the payment (ids are
 * high-entropy and never listed), which is the same threat model as the
 * plugin endpoint this replaces.
 */

type ConfirmResponse = {
  status:
    | 'succeeded'
    | 'processing'
    | 'requires_action'
    | 'failed'
    | 'unknown'
  orderID?: number | string
  /** Grants the guest read access to their order page. */
  accessToken?: string
  /** The cart this payment spent — lets the client clear only its own cart. */
  cartID?: number | string
  /** GA4 purchase payload — the client fires it once, keyed on the order id. */
  analytics?: GaPurchase
  message?: string
}

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config })
  await ensureStripeCredentialsLoaded(payload)

  const stripe = getStripe()

  if (!stripe) {
    return Response.json(
      { status: 'unknown', message: 'Payments are not configured.' } satisfies ConfirmResponse,
      { status: 503 },
    )
  }

  let paymentIntentID: unknown
  let sessionID: unknown

  try {
    const body = await request.json()
    paymentIntentID = body?.paymentIntentID
    sessionID = body?.sessionID
  } catch {
    return Response.json(
      { status: 'unknown', message: 'Invalid request body.' } satisfies ConfirmResponse,
      { status: 400 },
    )
  }

  // ---- Checkout Session path (embedded checkout return leg) --------------
  // Same trust model as the PI path: a cs_ id is high-entropy and only known
  // to a party of the payment. This is Stripe's "fulfil from the landing page
  // too" fast path — the webhook remains the guaranteed trigger.
  if (typeof sessionID === 'string' && sessionID.startsWith('cs_')) {
    let session
    try {
      session = await stripe.checkout.sessions.retrieve(sessionID, {
        expand: ['payment_intent'],
      })
    } catch {
      return Response.json(
        { status: 'unknown', message: 'Payment not found.' } satisfies ConfirmResponse,
        { status: 404 },
      )
    }

    if (session.status === 'expired') {
      return Response.json({
        status: 'failed',
        message: 'The checkout session expired before payment completed. You have not been charged.',
      } satisfies ConfirmResponse)
    }

    if (session.payment_status === 'unpaid') {
      // Either still open (customer backed out) or an async method settling.
      return Response.json({
        status: session.status === 'complete' ? 'processing' : 'failed',
        message:
          session.status === 'complete'
            ? undefined
            : 'The payment was not completed. You have not been charged.',
      } satisfies ConfirmResponse)
    }

    const result = await fulfillCheckoutSession({ payload, stripe, session })

    if (!result.orderId) {
      payload.logger.error(
        { sessionId: session.id, reason: result.reason },
        'Paid session but no order exists after confirm',
      )
      return Response.json(
        {
          status: 'succeeded',
          message:
            'Your payment was received, but we could not display your order. You will receive a confirmation email — nothing further is needed.',
        } satisfies ConfirmResponse,
        { status: 500 },
      )
    }

    // depth 2 resolves items→product (through defaultPopulate) — enough for
    // the GA4 purchase payload without a second query.
    const order = await payload.findByID({
      collection: 'orders',
      id: result.orderId,
      depth: 2,
      overrideAccess: true,
    })

    return Response.json({
      status: 'succeeded',
      orderID: result.orderId,
      ...(typeof order?.accessToken === 'string' ? { accessToken: order.accessToken } : {}),
      ...(result.cartID ? { cartID: result.cartID } : {}),
      ...(order ? { analytics: orderToGaPurchase(order) } : {}),
    } satisfies ConfirmResponse)
  }

  // ---- Legacy PaymentIntent path -----------------------------------------
  if (typeof paymentIntentID !== 'string' || !paymentIntentID.startsWith('pi_')) {
    return Response.json(
      { status: 'unknown', message: 'A payment reference is required.' } satisfies ConfirmResponse,
      { status: 400 },
    )
  }

  let paymentIntent
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentID)
  } catch {
    return Response.json(
      { status: 'unknown', message: 'Payment not found.' } satisfies ConfirmResponse,
      { status: 404 },
    )
  }

  // Async payment methods sit in `processing` for a while after the customer
  // has done their part. Not an error — the client polls until it resolves.
  if (paymentIntent.status === 'processing') {
    return Response.json({ status: 'processing' } satisfies ConfirmResponse)
  }

  if (paymentIntent.status !== 'succeeded') {
    const failed =
      paymentIntent.status === 'requires_payment_method' ||
      paymentIntent.status === 'canceled'

    return Response.json({
      status: failed ? 'failed' : 'requires_action',
      message: failed
        ? 'The payment was not completed. You have not been charged.'
        : 'The payment needs another step before it completes.',
    } satisfies ConfirmResponse)
  }

  const result = await ensureOrderForPaymentIntent({ payload, paymentIntent, source: 'checkout' })

  if (!result.orderId) {
    // Succeeded payment but no order could be built — ensureOrder has already
    // logged the specifics. Tell the customer the truth without the internals.
    payload.logger.error(
      { paymentIntent: paymentIntent.id, reason: result.reason },
      'Payment succeeded but no order exists after confirm',
    )
    return Response.json(
      {
        status: 'succeeded',
        message:
          'Your payment was received, but we could not display your order. You will receive a confirmation email — nothing further is needed.',
      } satisfies ConfirmResponse,
      { status: 500 },
    )
  }

  // The access token lives on the order document (minted by a beforeValidate
  // hook) — fetch it so guests can open their order page. `overrideAccess` is
  // safe here for the same reason the endpoint exists at all: possession of
  // the PaymentIntent id is the credential.
  const order = await payload.findByID({
    collection: 'orders',
    id: result.orderId,
    depth: 2,
    overrideAccess: true,
  })

  return Response.json({
    status: 'succeeded',
    orderID: result.orderId,
    ...(typeof order?.accessToken === 'string' ? { accessToken: order.accessToken } : {}),
    ...(order ? { analytics: orderToGaPurchase(order) } : {}),
  } satisfies ConfirmResponse)
}
