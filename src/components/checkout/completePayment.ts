/**
 * Client side of the payment-completion endpoint.
 *
 * One function for every return leg (embedded Checkout's session_id and the
 * legacy payment_intent flow), so the paths cannot drift apart — drift is
 * exactly how the old redirect path ended up missing the email parameter the
 * old in-page path sent.
 *
 * `processing` is a real outcome, not an error: async payment methods can take
 * seconds-to-minutes after the customer approves. We poll briefly; if it is
 * still processing when patience runs out, the caller shows the "you'll get an
 * email" state — the webhook creates the order server-side regardless.
 */

export type CompletePaymentResult = {
  status: 'succeeded' | 'processing' | 'requires_action' | 'failed' | 'unknown'
  orderID?: number | string
  accessToken?: string
  /** The cart the payment spent — clear the local cart only if it matches. */
  cartID?: number | string
  /** GA4 purchase payload built server-side from the order. */
  analytics?: import('@/lib/analytics/items').GaPurchase
  message?: string
}

const POLL_INTERVAL_MS = 2500
const MAX_POLLS = 12 // ~30 seconds of patience before deferring to email

/** Exactly one of the two references identifies the payment. */
export type PaymentRef = { paymentIntentID: string } | { sessionID: string }

const callConfirm = async (ref: PaymentRef): Promise<CompletePaymentResult> => {
  const response = await fetch('/next/checkout/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(ref),
  })

  const body = (await response.json().catch(() => null)) as CompletePaymentResult | null

  if (!body || typeof body.status !== 'string') {
    return { status: 'unknown', message: 'Could not confirm the payment. Please contact support.' }
  }

  return body
}

export const completePayment = async ({
  ref,
  patience = 'poll',
  onProcessing,
}: {
  ref: PaymentRef
  /**
   * 'poll' waits out a `processing` payment; 'none' returns it immediately so
   * the caller can hand off to a page with proper waiting UI instead of a
   * disabled button.
   */
  patience?: 'poll' | 'none'
  /** Called once when polling starts, so the UI can explain the wait. */
  onProcessing?: () => void
}): Promise<CompletePaymentResult> => {
  let result = await callConfirm(ref)

  if (result.status === 'processing' && patience === 'poll') {
    onProcessing?.()

    for (let attempt = 0; attempt < MAX_POLLS && result.status === 'processing'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      result = await callConfirm(ref)
    }
  }

  return result
}

/** The /orders/:id URL with whatever credentials the viewer needs to open it. */
export const orderUrl = ({
  orderID,
  accessToken,
  email,
}: {
  orderID: number | string
  accessToken?: string
  email?: string | null
}): string => {
  const params = new URLSearchParams()
  if (email) params.set('email', email)
  if (accessToken) params.set('accessToken', accessToken)
  const query = params.toString()
  return `/orders/${orderID}${query ? `?${query}` : ''}`
}
