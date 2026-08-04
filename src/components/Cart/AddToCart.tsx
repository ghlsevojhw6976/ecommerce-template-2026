'use client'

import { Button } from '@/components/ui/button'
import type { Product } from '@/payload-types'

import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import clsx from 'clsx'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useCartUI } from '@/providers/Cart'
import { useStripeCheckout } from '@/components/checkout/useStripeCheckout'
import { gaItem, trackAddToCart, trackBeginCheckout } from '@/lib/analytics/gtag'

type Props = {
  product: Product
}

type CartItems = NonNullable<ReturnType<typeof useCart>['cart']>['items']

/** Quantity of this product currently in the cart. */
const quantityInCart = (items: CartItems, productID: Product['id']): number => {
  const match = items?.find((item) => {
    const itemProductID = typeof item.product === 'object' ? item.product?.id : item.product
    return itemProductID === productID
  })

  return match?.quantity ?? 0
}

/**
 * The buy box CTAs: Add to cart (primary) and Buy now (direct to checkout).
 *
 * Two behaviours here exist because the provider cannot be taken at its word:
 * its `addItem` swallows every failure and resolves anyway, so a bare
 * `.then(() => toast.success(...))` congratulated customers on adds that
 * never happened. Success is now defined as "the cart state actually gained
 * the item", watched via effect — and the confirmation is the cart drawer
 * opening with the item visibly in it, not an assertion in a corner.
 *
 * Buy now goes straight to Stripe's hosted checkout — for THIS item only,
 * through an ephemeral server-side cart. The customer's real cart is never
 * read or spent (the Amazon-established meaning of the button: someone with
 * $2,000 of other items in their cart is not asking to be charged for them).
 * The product page is the review; Stripe's page shows the item again before
 * any card number is typed. The label says "with Stripe" so the redirect is
 * opted into, never a surprise (Baymard's third-party payment rule).
 */
export function AddToCart({ product }: Props) {
  const { addItem, cart, isLoading } = useCart()
  const { openCart } = useCartUI()
  const { startCheckout } = useStripeCheckout()

  const [pendingAction, setPendingAction] = useState<null | 'add' | 'buy'>(null)
  // What "success" looks like for the pending action: the cart reaching this
  // quantity for this product.
  const expected = useRef<{ productID: Product['id']; qty: number } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = useCallback(
    (action: 'add') => {
      expected.current = {
        productID: product.id,
        qty: quantityInCart(cart?.items, product.id) + 1,
      }
      setPendingAction(action)

      // If the cart never reaches the expected state, say so — the one thing
      // worse than an error is a success message over a failure.
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        expected.current = null
        setPendingAction(null)
        toast.error('The item could not be added to the cart. Please try again.')
      }, 6000)

      void addItem({ product: product.id })
    },
    [addItem, cart?.items, product.id],
  )

  const buyNow = useCallback(() => {
    setPendingAction('buy')
    // Buy now IS checkout intent for this one item — the GA4 funnel event.
    trackBeginCheckout([gaItem(product)])
    void startCheckout({ buyNow: { productID: product.id } }).then((error) => {
      if (error) {
        toast.error(error)
        setPendingAction(null)
      }
      // On success the browser is navigating to Stripe — leave the button in
      // its redirecting state so it cannot be double-clicked into two tabs.
    })
  }, [startCheckout, product.id])

  // Watch the cart for the expected quantity — the only trustworthy signal
  // that Add to cart actually worked.
  useEffect(() => {
    if (pendingAction !== 'add' || !expected.current) return

    const { productID, qty } = expected.current
    if (quantityInCart(cart?.items, productID) < qty) return

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    expected.current = null

    // Fired HERE, not on click: this effect is the verified "the cart really
    // gained the item" signal, so analytics counts real adds, not attempts.
    trackAddToCart(gaItem(product))

    openCart()
    setPendingAction(null)
  }, [cart, pendingAction, openCart, product])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const maxInCart = useMemo<boolean>(() => {
    const inCart = quantityInCart(cart?.items, product.id)
    if (!inCart) return false
    return inCart >= (product.inventory ?? 0)
  }, [cart?.items, product])

  const outOfStock = product.inventory === 0

  const addDisabled = outOfStock || maxInCart || isLoading || pendingAction !== null
  const buyDisabled = outOfStock || pendingAction !== null

  const primaryLabel = outOfStock
    ? 'Out of stock'
    : maxInCart
      ? 'Maximum in cart'
      : pendingAction === 'add'
        ? 'Adding…'
        : 'Add to cart'

  return (
    <div className="flex flex-col gap-3">
      {/* Full-width, solid, and large. The primary action on a $749 page cannot
          be a small outline button — an under-weighted CTA reads as a site that
          is not confident in what it is selling. */}
      <Button
        aria-label="Add to cart"
        className={clsx(
          'h-14 w-full text-base tracking-wide transition-all',
          'hover:-translate-y-px hover:shadow-[var(--elevation-overlay)]',
          'disabled:translate-y-0 disabled:shadow-none',
        )}
        disabled={addDisabled}
        onClick={(e) => {
          e.preventDefault()
          start('add')
        }}
        size="lg"
        type="submit"
        variant="default"
      >
        {primaryLabel}
      </Button>

      {!outOfStock && (
        <Button
          aria-label="Buy now"
          className="h-12 w-full text-base tracking-wide"
          disabled={buyDisabled}
          onClick={(e) => {
            e.preventDefault()
            buyNow()
          }}
          size="lg"
          type="button"
          variant="outline"
        >
          {pendingAction === 'buy' ? 'Opening secure checkout…' : 'Buy now'}
        </Button>
      )}
    </div>
  )
}
