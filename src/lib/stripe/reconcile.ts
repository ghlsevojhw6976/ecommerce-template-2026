import type { Payload } from 'payload'

import { getStripe } from './client'

/**
 * Compares local transactions against Stripe and reports disagreements.
 *
 * Stripe is the source of truth for whether money moved. Our database is the
 * source of truth for everything else. When they disagree, it is almost always
 * because a webhook was missed — so the interesting output is the list of
 * transactions whose local status lags what Stripe already recorded.
 */

export type Drift = {
  transactionId: number
  paymentIntentId: string
  localStatus: string
  stripeStatus: string
  localAmount: number
  stripeAmount: number
  issue: 'status-mismatch' | 'amount-mismatch' | 'missing-in-stripe' | 'unreadable'
  /** Whether syncing from Stripe would resolve it automatically. */
  repairable: boolean
}

export type ReconcileReport = {
  checkedAt: string
  checked: number
  matched: number
  drift: Drift[]
  skippedNoPaymentIntent: number
  error?: string
}

/** Stripe PaymentIntent status -> our transaction status. */
export const mapIntentStatus = (stripeStatus: string): string => {
  switch (stripeStatus) {
    case 'succeeded':
      return 'succeeded'
    case 'canceled':
      return 'cancelled'
    case 'processing':
    case 'requires_action':
    case 'requires_confirmation':
    case 'requires_payment_method':
    case 'requires_capture':
      return 'pending'
    default:
      return 'pending'
  }
}

export const reconcile = async ({
  payload,
  limit = 100,
}: {
  payload: Payload
  limit?: number
}): Promise<ReconcileReport> => {
  const checkedAt = new Date().toISOString()
  const stripe = getStripe()

  if (!stripe) {
    return {
      checkedAt,
      checked: 0,
      matched: 0,
      drift: [],
      skippedNoPaymentIntent: 0,
      error: 'STRIPE_SECRET_KEY is not set.',
    }
  }

  const { docs } = await payload.find({
    collection: 'transactions',
    depth: 0,
    limit,
    sort: '-createdAt',
  })

  const drift: Drift[] = []
  let matched = 0
  let checked = 0
  let skippedNoPaymentIntent = 0

  for (const tx of docs) {
    const paymentIntentId = (tx as Record<string, any>)?.stripe?.paymentIntentID

    // Not every transaction reaches Stripe (abandoned checkouts, other methods).
    if (!paymentIntentId) {
      skippedNoPaymentIntent++
      continue
    }

    checked++
    const localStatus = String((tx as Record<string, any>).status ?? 'unknown')
    const localAmount = Number((tx as Record<string, any>).amount ?? 0)

    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
      const expected = mapIntentStatus(intent.status)

      // A refunded transaction legitimately sits on a succeeded intent.
      const statusAgrees = localStatus === expected || localStatus === 'refunded'
      const amountAgrees = localAmount === intent.amount

      if (statusAgrees && amountAgrees) {
        matched++
        continue
      }

      drift.push({
        transactionId: tx.id as number,
        paymentIntentId,
        localStatus,
        stripeStatus: intent.status,
        localAmount,
        stripeAmount: intent.amount,
        issue: statusAgrees ? 'amount-mismatch' : 'status-mismatch',
        // Amount drift is never auto-repaired: it means the order was built
        // differently from what was charged, which needs a human.
        repairable: !statusAgrees && amountAgrees,
      })
    } catch (error) {
      const missing =
        error instanceof Error && /No such payment_intent/i.test(error.message)

      drift.push({
        transactionId: tx.id as number,
        paymentIntentId,
        localStatus,
        stripeStatus: '—',
        localAmount,
        stripeAmount: 0,
        issue: missing ? 'missing-in-stripe' : 'unreadable',
        repairable: false,
      })
    }
  }

  return { checkedAt, checked, matched, drift, skippedNoPaymentIntent }
}
