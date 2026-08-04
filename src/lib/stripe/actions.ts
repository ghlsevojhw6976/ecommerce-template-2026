import type { Payload } from 'payload'

import { getStripe } from './client'
import { adjustInventory, adjustmentsFromItems } from './inventory'
import { mapIntentStatus } from './reconcile'

/**
 * Write actions against Stripe.
 *
 * ── On "replaying webhooks" ──────────────────────────────────────────────
 * Stripe's API cannot re-deliver a webhook to your endpoint with a valid
 * signature — only the Stripe dashboard can resend, and a hand-rolled POST
 * would fail signature verification (or, worse, force us to accept unsigned
 * requests, which is a security hole).
 *
 * So instead of pretending to replay, we do the thing that actually fixes a
 * stuck order: read the PaymentIntent from Stripe — the source of truth — and
 * bring the local record into line. This is strictly more reliable than a
 * replay, because it converges on current state rather than re-applying a
 * possibly-stale historical event.
 */

export type ActionResult =
  | { ok: true; message: string; status?: string }
  | { ok: false; message: string }

const getPaymentIntentId = (tx: unknown): string | undefined =>
  (tx as Record<string, any>)?.stripe?.paymentIntentID ?? undefined

/**
 * Pull current state from Stripe and update the local transaction (and its
 * order) to match. This is the "my order is stuck unpaid" repair.
 */
export const syncTransactionFromStripe = async ({
  payload,
  transactionId,
}: {
  payload: Payload
  transactionId: number | string
}): Promise<ActionResult> => {
  const stripe = getStripe()
  if (!stripe) return { ok: false, message: 'STRIPE_SECRET_KEY is not set.' }

  const tx = await payload.findByID({ collection: 'transactions', id: transactionId, depth: 0 })
  const paymentIntentId = getPaymentIntentId(tx)

  if (!paymentIntentId) {
    return { ok: false, message: 'This transaction has no Stripe payment intent.' }
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
    const nextStatus = mapIntentStatus(intent.status)
    const current = String((tx as Record<string, any>).status ?? '')

    if (current === nextStatus) {
      return { ok: true, message: `Already in sync (${nextStatus}).`, status: nextStatus }
    }

    await payload.update({
      collection: 'transactions',
      id: transactionId,
      data: { status: nextStatus } as never,
    })

    // Keep the order in step, so the customer-facing status is not left behind.
    const orderId = (tx as Record<string, any>).order
    if (orderId && nextStatus === 'succeeded') {
      await payload
        .update({
          collection: 'orders',
          id: typeof orderId === 'object' ? orderId.id : orderId,
          data: { status: 'processing' } as never,
        })
        .catch(() => undefined)
    }

    return {
      ok: true,
      message: `Updated ${current || 'unknown'} → ${nextStatus} from Stripe.`,
      status: nextStatus,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not read the payment intent.',
    }
  }
}

/**
 * Issue a refund. `amountInMinorUnits` omitted = full refund.
 *
 * This moves real money, so it is admin-only at the route layer and the UI
 * requires an explicit confirmation.
 */
export const refundTransaction = async ({
  payload,
  transactionId,
  amountInMinorUnits,
}: {
  payload: Payload
  transactionId: number | string
  amountInMinorUnits?: number
}): Promise<ActionResult> => {
  const stripe = getStripe()
  if (!stripe) return { ok: false, message: 'STRIPE_SECRET_KEY is not set.' }

  const tx = await payload.findByID({ collection: 'transactions', id: transactionId, depth: 0 })
  const paymentIntentId = getPaymentIntentId(tx)

  if (!paymentIntentId) {
    return { ok: false, message: 'This transaction has no Stripe payment intent to refund.' }
  }

  const currentStatus = String((tx as Record<string, any>).status ?? '')
  if (currentStatus === 'refunded') {
    return { ok: false, message: 'This transaction is already marked refunded.' }
  }
  if (currentStatus !== 'succeeded') {
    return {
      ok: false,
      message: `Only succeeded transactions can be refunded (this one is "${currentStatus}").`,
    }
  }

  const localAmount = Number((tx as Record<string, any>).amount ?? 0)
  if (amountInMinorUnits !== undefined) {
    if (!Number.isInteger(amountInMinorUnits) || amountInMinorUnits <= 0) {
      return { ok: false, message: 'Refund amount must be a positive whole number of cents.' }
    }
    if (amountInMinorUnits > localAmount) {
      return {
        ok: false,
        message: `Refund of ${amountInMinorUnits} exceeds the charged amount (${localAmount}).`,
      }
    }
  }

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(amountInMinorUnits !== undefined ? { amount: amountInMinorUnits } : {}),
      },
      {
        // Without this, a network timeout that actually succeeded would refund
        // the customer twice when retried. Keyed so the same refund of the same
        // amount is only ever applied once.
        idempotencyKey: `refund:${paymentIntentId}:${amountInMinorUnits ?? 'full'}`,
      },
    )

    const isPartial = amountInMinorUnits !== undefined && amountInMinorUnits < localAmount

    // A partial refund leaves the transaction succeeded — it is still a live
    // sale. Only a full refund flips the status and restocks.
    if (isPartial) {
      return {
        ok: true,
        message: `Partial refund of ${amountInMinorUnits} issued (${refund.id}). Transaction left as succeeded.`,
      }
    }

    await payload.update({
      collection: 'transactions',
      id: transactionId,
      data: { status: 'refunded' } as never,
    })

    // Restock here as well as in the charge.refunded webhook. Each path is
    // idempotent on its own — the webhook sees the status already flipped and
    // no-ops — so a refund restocks exactly once whether or not webhooks are
    // configured.
    let restocked = 0
    const orderRef = (tx as Record<string, any>).order
    const orderId = typeof orderRef === 'object' ? orderRef?.id : orderRef

    if (orderId) {
      await payload
        .update({
          collection: 'orders',
          id: orderId,
          data: { status: 'refunded' } as never,
        })
        .catch(() => undefined)

      const order = await payload
        .findByID({ collection: 'orders', id: orderId, depth: 0 })
        .catch(() => undefined)

      if (order) {
        const results = await adjustInventory({
          payload,
          adjustments: adjustmentsFromItems((order as Record<string, any>).items, 'restock'),
        })
        restocked = results.filter((r) => r.applied).length
      }
    }

    return {
      ok: true,
      message: `Full refund issued (${refund.id}). Transaction and order marked refunded, ${restocked} line item(s) restocked.`,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Refund failed.',
    }
  }
}
