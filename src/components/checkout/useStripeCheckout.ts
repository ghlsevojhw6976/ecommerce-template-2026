'use client'

import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import { useCallback, useState } from 'react'

/**
 * The one way into Stripe checkout, shared by every entry point (cart drawer,
 * Buy now, the /checkout review page) so they cannot drift apart.
 *
 * Creates the session server-side (prices always from Postgres), adopts a
 * revived cart identity if the server had to replace a purchased cart, and
 * redirects. Returns an error message instead of throwing — entry points
 * decide how to show it (toast in the drawer, inline on the review page).
 *
 * `isRedirecting` stays true once navigation starts: the button that
 * triggered it must stay disabled until the browser actually leaves, or a
 * double-click opens two checkout tabs.
 */
export const useStripeCheckout = () => {
  const { cart } = useCart()
  const [isRedirecting, setIsRedirecting] = useState(false)

  const cartReady = Boolean(cart?.id && cart?.items?.length)

  const startCheckout = useCallback(
    async (options?: {
      /**
       * Buy THIS item now through an ephemeral single-item cart — the
       * customer's real cart is never read or spent. Omit for a normal
       * whole-cart checkout.
       */
      buyNow?: { productID: number | string; quantity?: number }
    }): Promise<string | null> => {
    const buyNow = options?.buyNow

    if (!buyNow && !cart?.id) return 'Your cart is empty.'

    setIsRedirecting(true)

    try {
      // The guest cart secret is issued by the commerce provider at cart
      // creation and kept in localStorage next to the cart id. Logged-in
      // customers authorise via their session cookie instead.
      const cartSecret =
        typeof window !== 'undefined' ? window.localStorage.getItem('cart_secret') : null

      const body = buyNow
        ? { buyNow: { product: buyNow.productID, quantity: buyNow.quantity ?? 1 } }
        : { cartID: cart!.id, ...(cartSecret ? { cartSecret } : {}) }

      const response = await fetch('/next/checkout/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const responseBody = (await response.json().catch(() => null)) as {
        url?: string
        message?: string
        replacedCart?: { id: number | string; secret?: string }
      } | null

      if (!response.ok || !responseBody?.url) {
        setIsRedirecting(false)
        return responseBody?.message || 'Could not start the payment. Please try again.'
      }

      // The server may have revived a purchased cart into a fresh one (this
      // browser was still holding a cart that was paid for elsewhere or in a
      // closed tab). Adopt the new identity BEFORE leaving, so the return —
      // and every visit after — uses the live cart, not the dead one.
      if (responseBody.replacedCart) {
        window.localStorage.setItem('cart', String(responseBody.replacedCart.id))
        if (responseBody.replacedCart.secret) {
          window.localStorage.setItem('cart_secret', responseBody.replacedCart.secret)
        } else {
          window.localStorage.removeItem('cart_secret')
        }
      }

      window.location.assign(responseBody.url)
      return null
    } catch {
      setIsRedirecting(false)
      return 'Could not start the payment. Please try again.'
    }
    },
    [cart?.id],
  )

  return { startCheckout, isRedirecting, cartReady }
}
