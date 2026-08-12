'use client'

import { Media } from '@/components/Media'
import { Message } from '@/components/Message'
import { Price } from '@/components/Price'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/providers/Auth'
import { useStripeCheckout } from '@/components/checkout/useStripeCheckout'
import { Lock } from 'lucide-react'
import Link from 'next/link'
import React, { useCallback, useState } from 'react'

import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import { gaItem, trackBeginCheckout } from '@/lib/analytics/gtag'
import { totalSavingsCents } from '@/lib/commerce/discount'
import { shippingCostCents, centsToFreeShipping } from '@/lib/commerce/shipping'
import { Product, Variant } from '@/payload-types'

import { DeleteItemButton } from '@/components/Cart/DeleteItemButton'
import { EditItemQuantityButton } from '@/components/Cart/EditItemQuantityButton'

type GalleryItem = NonNullable<Product['gallery']>[number]
type VariantOptionRef = NonNullable<Variant['options']>[number]

/**
 * Checkout = a review step, then Stripe's hosted checkout page.
 *
 * The review step exists because at this price point buyers want one look at
 * exactly what they are about to pay before any payment form appears (the
 * research is consistent that instant-payment flows win only at low AOV). It
 * is also where the shop's pricing promises are kept explicit: shipping (free
 * over the threshold, a flat fee below it — lib/commerce/shipping.ts) and
 * duties are both priced here exactly as Stripe will charge them, so the
 * total on checkout.stripe.com can never surprise a customer who read this
 * page.
 *
 * Everything after the button happens on checkout.stripe.com — Stripe's
 * full-page checkout collecting email, delivery address (with autocomplete),
 * phone and payment, with the shop's logo and colours from the Stripe
 * dashboard's branding settings. The redirect is SIGNPOSTED on the button
 * per Baymard's third-party-payment guidelines: customers must knowingly opt
 * into leaving, and they return here automatically after paying (or via
 * Stripe's back button if they change their mind).
 *
 * We maintain no address UI, no card UI, and load no Stripe.js on this site.
 */
export const CheckoutPage: React.FC<{
  freeShippingThreshold?: number | null
  flatShippingFee?: number | null
}> = ({ freeShippingThreshold, flatShippingFee }) => {
  const { user } = useAuth()
  const { cart } = useCart()
  const { startCheckout, isRedirecting } = useStripeCheckout()
  const [error, setError] = useState<string | null>(null)

  const cartIsEmpty = !cart || !cart.items || !cart.items.length
  const subtotal = cart?.subtotal || 0
  const shippingAmount = shippingCostCents(subtotal, { freeShippingThreshold, flatShippingFee })
  const amountToFree = centsToFreeShipping(subtotal, { freeShippingThreshold, flatShippingFee })

  // Variant lines excluded: variants price themselves and carry no compare-at.
  const savings = totalSavingsCents(
    (cart?.items ?? [])
      .filter((item) => !item.variant)
      .map((item) => ({
        product: typeof item.product === 'object' ? item.product : null,
        quantity: item.quantity || 0,
      })),
  )

  const startPayment = useCallback(async () => {
    setError(null)
    trackBeginCheckout(
      (cart?.items ?? [])
        .filter((item) => !item.variant && typeof item.product === 'object' && item.product)
        .map((item) => gaItem(item.product as never, item.quantity || 1)),
    )
    const failure = await startCheckout()
    if (failure) setError(failure)
  }, [startCheckout, cart])

  if (cartIsEmpty) {
    return (
      <div className="prose dark:prose-invert py-12 w-full items-center">
        <p>Your cart is empty.</p>
        <Link href="/shop">Continue shopping?</Link>
      </div>
    )
  }

  return (
    <div className="my-8 flex grow flex-col items-stretch gap-10 md:flex-row md:gap-6 lg:gap-8">
      <div className="flex basis-full flex-col gap-6 lg:basis-3/5">
        <h2 className="font-medium text-3xl">Review your order</h2>

        {user ? (
          <p className="text-sm text-muted-foreground">
            Checking out as {user.email} ·{' '}
            <Link className="underline" href="/logout">
              log out
            </Link>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Checking out as a guest — no account needed. Your email and delivery address are
            entered on the payment page.
          </p>
        )}

        {error && <Message error={error} />}

        <div className="flex flex-col gap-3">
          <Button
            className="h-14 self-start px-8 text-base tracking-wide"
            disabled={isRedirecting}
            onClick={() => void startPayment()}
            size="lg"
          >
            <Lock aria-hidden size={16} strokeWidth={2} />
            {isRedirecting ? 'Opening secure checkout…' : 'Continue to secure checkout'}
          </Button>
          {/* Signposting per Baymard: never move a customer toward a payment
              processor without saying so. */}
          <p className="text-sm text-muted-foreground">
            You&apos;ll complete your payment on Stripe&apos;s secure checkout page and return
            here automatically.
          </p>
          <Link className="text-sm underline" href="/shop">
            Back to shopping
          </Link>
        </div>
      </div>

      <div className="w-full basis-full self-start rounded-lg border-none bg-primary/5 p-8 lg:basis-2/5 lg:pl-8 flex flex-col gap-6">
        <h2 className="text-2xl font-medium">Order summary</h2>
        {cart?.items?.map((item, index) => {
          if (typeof item.product === 'object' && item.product) {
            const {
              product,
              product: { meta, title, gallery },
              quantity,
              variant,
            } = item

            if (!quantity) return null

            let image = gallery?.[0]?.image || meta?.image
            let price = product?.priceInUSD

            const isVariant = Boolean(variant) && typeof variant === 'object'

            if (isVariant) {
              price = variant?.priceInUSD

              const imageVariant = product.gallery?.find((galleryItem: GalleryItem) => {
                if (!galleryItem.variantOption) return false
                const variantOptionID =
                  typeof galleryItem.variantOption === 'object'
                    ? galleryItem.variantOption.id
                    : galleryItem.variantOption

                return variant?.options?.some((option: VariantOptionRef) => {
                  if (typeof option === 'object') return option.id === variantOptionID
                  return option === variantOptionID
                })
              })

              if (imageVariant && typeof imageVariant.image !== 'string') {
                image = imageVariant.image
              }
            }

            return (
              <div className="flex items-start gap-4" key={index}>
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-product-surface">
                  {image && typeof image !== 'string' && (
                    <Media
                      className="relative h-full w-full p-1"
                      fill
                      imgClassName="object-contain"
                      resource={image}
                    />
                  )}
                </div>
                <div className="flex grow items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium leading-snug">{title}</p>
                    {variant && typeof variant === 'object' && (
                      <p className="text-sm text-muted-foreground">
                        {variant.options
                          ?.map((option: VariantOptionRef) =>
                            typeof option === 'object' ? option.label : null,
                          )
                          .join(', ')}
                      </p>
                    )}
                    {/* Editable right up to the moment of payment — this page
                        is where a customer returning from Stripe's back
                        button adjusts the order before retrying. */}
                    <div className="flex h-8 w-fit flex-row items-center rounded-lg border">
                      <EditItemQuantityButton item={item} type="minus" />
                      <p className="w-6 text-center">
                        <span className="w-full text-sm">{quantity}</span>
                      </p>
                      <EditItemQuantityButton item={item} type="plus" />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {typeof price === 'number' && (
                      <Price
                        amount={price * quantity}
                        compareAtAmount={
                          !isVariant && typeof product.compareAtPriceInUSD === 'number'
                            ? product.compareAtPriceInUSD * quantity
                            : undefined
                        }
                      />
                    )}
                    <DeleteItemButton item={item} />
                  </div>
                </div>
              </div>
            )
          }
          return null
        })}
        <hr />
        <div className="flex flex-col gap-2 text-sm">
          {savings > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Total savings</span>
              <Price amount={savings} />
            </div>
          )}
          <div className="flex justify-between">
            <span>Subtotal</span>
            <Price amount={subtotal} />
          </div>
          <div className="flex justify-between">
            <span>Shipping</span>
            {shippingAmount === 0 ? <span>Free</span> : <Price amount={shippingAmount} />}
          </div>
          {shippingAmount > 0 && (
            <p className="text-xs text-muted-foreground">
              Add ${(amountToFree / 100).toFixed(2)} more to qualify for free shipping.
            </p>
          )}
          <div className="flex justify-between">
            <span>Duties &amp; import taxes</span>
            <span>Included</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <span className="uppercase">Total</span>{' '}
          <Price className="text-3xl font-medium" amount={subtotal + shippingAmount} />
        </div>
      </div>
    </div>
  )
}
