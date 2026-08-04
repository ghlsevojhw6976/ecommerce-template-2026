import type { PayloadRequest } from 'payload'
import type { Stripe } from 'stripe'

import { ensureOrderForPaymentIntent } from './ensureOrder'
import { fulfillCheckoutSession } from './fulfillSession'
import { adjustInventory, adjustmentsFromItems } from './inventory'

/**
 * Stripe webhook handlers.
 *
 * ── How the plugin dispatches ───────────────────────────────────────────
 * The adapter verifies the Stripe signature, then looks up
 * `webhooks[event.type]`. Handlers run ONLY for events whose signature
 * verified, so anything reaching this file is authentic. Events with no entry
 * here are ACKed with 200 and discarded — registering an endpoint in the
 * dashboard does nothing unless the event also appears below.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────
 * Stripe retries until it receives a 2xx and may deliver the same event twice.
 * Every handler is wrapped in `withEventLedger`, which claims the event id in
 * the `stripe-events` collection via a unique index. A duplicate delivery loses
 * the race on that insert and returns without doing the work again.
 *
 * ── Error policy ────────────────────────────────────────────────────────
 * Handlers swallow their errors after recording them. Throwing would make the
 * adapter return non-2xx, and Stripe would retry the event for up to ~3 days —
 * which is right for a transient fault but a retry storm for a genuine bug.
 * The failure is recorded in the ledger with its message so it can be found and
 * replayed deliberately.
 */

type StripeWebhookHandler = (args: {
  event: Stripe.Event
  req: PayloadRequest
  stripe: Stripe
}) => Promise<void> | void

/**
 * Claims an event id, runs the handler, and records the outcome.
 * Returns early if the event was already handled.
 */
const withEventLedger = async (
  event: Stripe.Event,
  req: PayloadRequest,
  handler: () => Promise<string>,
): Promise<void> => {
  const { payload } = req

  // Claim the event. The unique index on eventId makes this the lock: a
  // concurrent or repeat delivery fails here and bails out.
  try {
    await payload.create({
      collection: 'stripe-events',
      data: {
        eventId: event.id,
        type: event.type,
        status: 'received',
        livemode: event.livemode,
      } as never,
    })
  } catch {
    payload.logger.info(
      { eventId: event.id, type: event.type },
      'Stripe event already seen — skipping duplicate delivery',
    )
    return
  }

  const markOutcome = async (status: string, notes: string, error?: string) => {
    const existing = await payload.find({
      collection: 'stripe-events',
      depth: 0,
      limit: 1,
      where: { eventId: { equals: event.id } },
    })
    const doc = existing.docs[0]
    if (!doc) return

    await payload
      .update({
        collection: 'stripe-events',
        id: doc.id,
        data: {
          status,
          notes,
          processedAt: new Date().toISOString(),
          ...(error ? { error } : {}),
        } as never,
      })
      .catch(() => undefined)
  }

  try {
    const notes = await handler()
    await markOutcome('processed', notes)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    payload.logger.error(
      { err: error, eventId: event.id, type: event.type },
      'Stripe webhook handler failed',
    )
    await markOutcome('failed', 'Handler threw — see error.', message)
    // Deliberately not rethrown; see the error policy above.
  }
}

/** Resolves the local transaction for a PaymentIntent id. */
const findTransactionByIntent = async (req: PayloadRequest, paymentIntentId: string) => {
  const found = await req.payload.find({
    collection: 'transactions',
    depth: 0,
    limit: 1,
    where: { 'stripe.paymentIntentID': { equals: paymentIntentId } },
  })
  return found.docs[0] as Record<string, any> | undefined
}

/** Finds the transaction for a Checkout Session id. */
const findTransactionBySession = async (req: PayloadRequest, sessionId: string) => {
  const found = await req.payload.find({
    collection: 'transactions',
    depth: 0,
    limit: 1,
    where: { 'stripe.checkoutSessionID': { equals: sessionId } },
  })
  return found.docs[0] as Record<string, any> | undefined
}

export const stripeWebhookHandlers: Record<string, StripeWebhookHandler> = {
  /**
   * The canonical order path for embedded Checkout. Payment completion has
   * three messengers (this event, async_payment_succeeded, and the customer's
   * return page); all of them converge on fulfillCheckoutSession, whose
   * transaction.order guard makes duplicates harmless.
   */
  'checkout.session.completed': async ({ event, req, stripe }) =>
    withEventLedger(event, req, async () => {
      const session = event.data.object as Stripe.Checkout.Session
      const result = await fulfillCheckoutSession({ payload: req.payload, stripe, session })
      return result.reason
    }),

  /**
   * Delayed payment methods (ACH and friends) complete after the session does
   * — `completed` arrives with payment_status 'unpaid' and THIS event carries
   * the actual money. Same fulfilment, later messenger.
   */
  'checkout.session.async_payment_succeeded': async ({ event, req, stripe }) =>
    withEventLedger(event, req, async () => {
      const session = event.data.object as Stripe.Checkout.Session
      const result = await fulfillCheckoutSession({ payload: req.payload, stripe, session })
      return result.reason
    }),

  /** A delayed payment that bounced — the customer thinks they paid. */
  'checkout.session.async_payment_failed': async ({ event, req }) =>
    withEventLedger(event, req, async () => {
      const session = event.data.object as Stripe.Checkout.Session
      const transaction = await findTransactionBySession(req, session.id)

      if (!transaction) return 'No local transaction for this Checkout Session.'
      if (transaction.status === 'failed') return 'Already marked failed.'

      await req.payload.update({
        collection: 'transactions',
        id: transaction.id,
        data: { status: 'failed' } as never,
      })

      // Loud: money the customer believes they sent did not arrive.
      req.payload.logger.warn(
        { sessionId: session.id, transactionId: transaction.id },
        'Async Checkout payment FAILED after session completion — customer may believe they paid',
      )

      return `Transaction ${transaction.id} marked failed (async payment failed).`
    }),

  /**
   * The customer walked away and the 24h session lapsed. No stock was
   * reserved, so there is nothing to restock — this just stops the pending
   * transaction from looking like drift in reconciliation forever.
   */
  'checkout.session.expired': async ({ event, req }) =>
    withEventLedger(event, req, async () => {
      const session = event.data.object as Stripe.Checkout.Session
      const transaction = await findTransactionBySession(req, session.id)

      if (!transaction) return 'No local transaction for this Checkout Session.'
      if (transaction.order) return 'Transaction already has an order — leaving untouched.'
      if (transaction.status !== 'pending') return `Transaction is ${transaction.status} — leaving untouched.`

      await req.payload.update({
        collection: 'transactions',
        id: transaction.id,
        data: { status: 'expired' } as never,
      })

      return `Transaction ${transaction.id} marked expired (session lapsed unpaid).`
    }),

  /**
   * The safety net. Creates the order when the customer never made it back to
   * the site after paying.
   */
  'payment_intent.succeeded': async ({ event, req }) =>
    withEventLedger(event, req, async () => {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const result = await ensureOrderForPaymentIntent({
        payload: req.payload,
        paymentIntent,
      })
      return result.reason
    }),

  /**
   * Without this, a failed payment leaves its transaction "pending" forever and
   * shows up as drift in reconciliation every time it runs.
   */
  'payment_intent.payment_failed': async ({ event, req }) =>
    withEventLedger(event, req, async () => {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const transaction = await findTransactionByIntent(req, paymentIntent.id)

      if (!transaction) return 'No local transaction for this PaymentIntent.'
      if (transaction.status === 'failed') return 'Already marked failed.'

      await req.payload.update({
        collection: 'transactions',
        id: transaction.id,
        data: { status: 'failed' } as never,
      })

      const reason = paymentIntent.last_payment_error?.message ?? 'unknown reason'
      return `Transaction ${transaction.id} marked failed (${reason}).`
    }),

  /**
   * Refunds issued from the Stripe dashboard would otherwise never reach us,
   * leaving the shop showing a paid order for money already returned.
   */
  'charge.refunded': async ({ event, req }) =>
    withEventLedger(event, req, async () => {
      const charge = event.data.object as Stripe.Charge
      const paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id

      if (!paymentIntentId) return 'Charge has no PaymentIntent.'

      const transaction = await findTransactionByIntent(req, paymentIntentId)
      if (!transaction) return 'No local transaction for this charge.'

      const fullyRefunded = charge.amount_refunded >= charge.amount

      // A partial refund leaves a live sale in place, so only a full refund
      // flips the status and restocks.
      if (!fullyRefunded) {
        return `Partial refund of ${charge.amount_refunded}/${charge.amount} — transaction left as ${transaction.status}.`
      }

      if (transaction.status === 'refunded') return 'Already marked refunded.'

      await req.payload.update({
        collection: 'transactions',
        id: transaction.id,
        data: { status: 'refunded' } as never,
      })

      let restocked = 0
      const orderId =
        transaction.order && typeof transaction.order === 'object'
          ? transaction.order.id
          : transaction.order

      if (orderId) {
        await req.payload
          .update({
            collection: 'orders',
            id: orderId,
            data: { status: 'refunded' } as never,
          })
          .catch(() => undefined)

        const order = await req.payload
          .findByID({ collection: 'orders', id: orderId, depth: 0 })
          .catch(() => undefined)

        if (order) {
          const results = await adjustInventory({
            payload: req.payload,
            adjustments: adjustmentsFromItems((order as Record<string, any>).items, 'restock'),
          })
          restocked = results.filter((r) => r.applied).length
        }
      }

      return `Full refund. Transaction ${transaction.id} refunded, ${restocked} line item(s) restocked.`
    }),

  /**
   * Chargebacks have a short response deadline, so the order is flagged
   * immediately rather than being noticed at month end.
   */
  'charge.dispute.created': async ({ event, req }) =>
    withEventLedger(event, req, async () => {
      const dispute = event.data.object as Stripe.Dispute
      const paymentIntentId =
        typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id

      if (!paymentIntentId) return 'Dispute has no PaymentIntent.'

      const transaction = await findTransactionByIntent(req, paymentIntentId)
      if (!transaction) return 'No local transaction for this dispute.'

      req.payload.logger.warn(
        {
          disputeId: dispute.id,
          amount: dispute.amount,
          reason: dispute.reason,
          dueBy: dispute.evidence_details?.due_by,
          transactionId: transaction.id,
        },
        'CHARGEBACK OPENED — evidence deadline applies',
      )

      const orderId =
        transaction.order && typeof transaction.order === 'object'
          ? transaction.order.id
          : transaction.order

      if (orderId) {
        await req.payload
          .update({
            collection: 'orders',
            id: orderId,
            data: { status: 'cancelled' } as never,
          })
          .catch(() => undefined)
      }

      return `Dispute ${dispute.id} (${dispute.reason}) for ${dispute.amount}. Order ${orderId ?? '—'} cancelled pending evidence.`
    }),
}

export const handledWebhookEvents = Object.keys(stripeWebhookHandlers)

/**
 * Events worth enabling on the Stripe endpoint, and why. `critical` ones cover
 * cases where money moves but our database would otherwise never hear about it.
 */
export const RECOMMENDED_WEBHOOK_EVENTS: {
  event: string
  why: string
  critical: boolean
}[] = [
  {
    event: 'checkout.session.completed',
    why: 'The primary order path — fulfils every completed embedded-Checkout payment.',
    critical: true,
  },
  {
    event: 'checkout.session.async_payment_succeeded',
    why: 'Delayed methods (e.g. bank debits) settle after the session completes — this is the money arriving.',
    critical: true,
  },
  {
    event: 'checkout.session.async_payment_failed',
    why: 'A delayed payment bounced after the customer left believing they had paid.',
    critical: true,
  },
  {
    event: 'checkout.session.expired',
    why: 'Marks abandoned checkout transactions expired so reconciliation stays clean.',
    critical: false,
  },
  {
    event: 'payment_intent.succeeded',
    why: 'Safety net — creates the order if the customer closed the tab before checkout finished.',
    critical: true,
  },
  {
    event: 'payment_intent.payment_failed',
    why: 'Marks the transaction failed instead of leaving it pending forever.',
    critical: false,
  },
  {
    event: 'charge.refunded',
    why: 'Keeps local status in step when a refund is issued from the Stripe dashboard, and restocks.',
    critical: true,
  },
  {
    event: 'charge.dispute.created',
    why: 'Chargeback opened — needs a human, and the deadline to respond is short.',
    critical: true,
  },
]

/** The plugin mounts payment endpoints at /api/payments/{method}. */
export const STRIPE_WEBHOOK_PATH = '/api/payments/stripe/webhooks'
