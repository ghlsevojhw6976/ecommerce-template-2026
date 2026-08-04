'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Message } from '@/components/Message'
import { useCart } from '@payloadcms/plugin-ecommerce/client/react'

import { completePayment, orderUrl } from '@/components/checkout/completePayment'
import { trackPurchaseOnce } from '@/lib/analytics/gtag'

/**
 * The return leg of every payment that leaves the page — 3DS challenges,
 * Klarna, Affirm, Cash App — and the waiting room for payments that succeed
 * asynchronously.
 *
 * Rules learned from the version this replaces:
 *
 * - NEVER gate on client cart state. The customer comes back here from
 *   another site; their cart cookie may be gone. The previous version
 *   early-returned on an empty cart and left PAID customers on an infinite
 *   spinner — the money does not live in localStorage.
 * - Every promise gets a `.catch` and every failure gets a visible state
 *   with a way forward. A silent spinner after money moved is how
 *   chargebacks happen.
 */
export const ConfirmOrder: React.FC = () => {
  const { clearCart } = useCart()
  const searchParams = useSearchParams()
  const router = useRouter()
  const started = useRef(false)

  const [state, setState] = useState<'confirming' | 'processing' | 'email-fallback' | 'failed'>(
    'confirming',
  )
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true

    // Embedded Checkout returns with ?session_id; the old inline flow used
    // ?payment_intent. Both are supported so any in-flight payment from
    // before a deploy still lands.
    const sessionID = searchParams.get('session_id')
    const paymentIntentID = searchParams.get('payment_intent')
    const email = searchParams.get('email')

    if (!sessionID && !paymentIntentID) {
      router.push('/')
      return
    }

    // Stripe appends redirect_status on the way back. 'failed' means the
    // customer cancelled or the method declined — money never moved.
    if (searchParams.get('redirect_status') === 'failed') {
      setState('failed')
      setMessage('The payment was not completed and you have not been charged.')
      return
    }

    completePayment({
      ref: sessionID ? { sessionID } : { paymentIntentID: paymentIntentID! },
      onProcessing: () => setState('processing'),
    })
      .then((result) => {
        // Clear the local cart ONLY when it is the cart this payment spent.
        // A Buy now purchase goes through an ephemeral single-item cart —
        // wiping the customer's real cart over it would delete items they
        // still intend to buy. (No cartID in the response = legacy payment
        // path, where the spent cart was always the local one.)
        const spentOwnCart =
          !result.cartID ||
          String(result.cartID) === window.localStorage.getItem('cart')

        if (result.status === 'succeeded' && result.orderID) {
          // GA4 purchase — payload built server-side from the order, fired
          // once per order id (localStorage guard survives refreshes).
          if (result.analytics) trackPurchaseOnce(result.analytics)
          if (spentOwnCart) clearCart()
          router.push(orderUrl({ orderID: result.orderID, accessToken: result.accessToken, email }))
          return
        }

        if (result.status === 'processing') {
          // Still settling after our patience ran out. The webhook creates
          // the order; the confirmation email is the customer's receipt.
          if (spentOwnCart) clearCart()
          setState('email-fallback')
          return
        }

        if (result.status === 'failed') {
          setState('failed')
          setMessage(result.message || 'The payment was not completed. You have not been charged.')
          return
        }

        setState('failed')
        setMessage(
          result.message ||
            'We could not confirm your order automatically. If you received a payment confirmation from your bank, contact us and we will locate your order.',
        )
      })
      .catch(() => {
        setState('failed')
        setMessage(
          'We could not confirm your order automatically. If you received a payment confirmation from your bank, contact us and we will locate your order — you will not be charged twice.',
        )
      })
  }, [searchParams, router, clearCart])

  if (state === 'failed') {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-6">
        <h1 className="text-2xl">Payment not completed</h1>
        {message && <Message error={message} />}
        <div className="flex gap-4">
          <Link className="underline" href="/checkout">
            Return to checkout
          </Link>
          <Link className="underline" href="/contact">
            Contact support
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'email-fallback') {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4">
        <h1 className="text-2xl">Payment received</h1>
        <p>
          Your payment is being processed. You will receive an order confirmation by email shortly
          — no further action is needed, and you will not be charged twice.
        </p>
        <Link className="underline" href="/">
          Continue shopping
        </Link>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center justify-start gap-4 text-center">
      <h1 className="text-2xl">
        {state === 'processing' ? 'Processing your payment' : 'Confirming your order'}
      </h1>
      {state === 'processing' && (
        <p className="text-muted-foreground">
          Your payment provider is finalising the payment. This can take a moment — please keep
          this page open.
        </p>
      )}
      <LoadingSpinner className="h-6 w-12" />
    </div>
  )
}
