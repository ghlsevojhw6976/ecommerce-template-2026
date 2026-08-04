'use client'

import { Price } from '@/components/Price'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import { ShoppingCart } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useMemo } from 'react'

import { useCartUI } from '@/providers/Cart'
import { useStripeCheckout } from '@/components/checkout/useStripeCheckout'
import { gaItem, trackBeginCheckout, trackViewCart, type GaItem } from '@/lib/analytics/gtag'
import { totalSavingsCents } from '@/lib/commerce/discount'
import { toast } from 'sonner'

import { DeleteItemButton } from './DeleteItemButton'
import { EditItemQuantityButton } from './EditItemQuantityButton'
import { OpenCartButton } from './OpenCart'
import { Button } from '@/components/ui/button'
import { Product, Variant } from '@/payload-types'

type GalleryItem = NonNullable<Product['gallery']>[number]
type VariantOptionRef = NonNullable<Variant['options']>[number]


export function CartModal() {
  const { cart } = useCart()
  const { startCheckout, isRedirecting } = useStripeCheckout()
  // Open state lives in a shared context so Add to cart can open the drawer —
  // visible confirmation where the customer is looking, not just a counter
  // changing in the corner.
  const { isOpen, setOpen, closeCart } = useCartUI()

  const pathname = usePathname()

  useEffect(() => {
    // Close the cart modal when the pathname changes.
    closeCart()
  }, [pathname, closeCart])

  const totalQuantity = useMemo(() => {
    if (!cart || !cart.items || !cart.items.length) return undefined
    return cart.items.reduce((quantity, item) => (item.quantity || 0) + quantity, 0)
  }, [cart])

  // GA4 items for the funnel events — product lines only (the variant
  // machinery is unused in the sibling-product model).
  const analyticsItems = useMemo<GaItem[]>(
    () =>
      (cart?.items ?? [])
        .filter((item) => !item.variant && typeof item.product === 'object' && item.product)
        .map((item) => gaItem(item.product as never, item.quantity || 1)),
    [cart],
  )

  // view_cart on each open — the drawer IS the cart page in this design.
  useEffect(() => {
    if (isOpen && analyticsItems.length) trackViewCart(analyticsItems)
    // Deliberately keyed on open state only: re-firing on every cart
    // mutation while the drawer sits open would inflate the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // "Total savings" — one quiet line above the subtotal when any line is on
  // sale. Variant lines are excluded: variants carry their own price and no
  // compare-at, so claiming the parent's saving there would be a false claim.
  const savings = useMemo(
    () =>
      totalSavingsCents(
        (cart?.items ?? [])
          .filter((item) => !item.variant)
          .map((item) => ({
            product: typeof item.product === 'object' ? item.product : null,
            quantity: item.quantity || 0,
          })),
      ),
    [cart],
  )

  return (
    <Sheet onOpenChange={setOpen} open={isOpen}>
      <SheetTrigger asChild>
        <OpenCartButton quantity={totalQuantity} />
      </SheetTrigger>

      {/* Full-width on phones: at w-3/4 the drawer leaves ~70px for the item
          title next to the price/qty column — one word per line. The sm:
          max-width from the sheet's own defaults still caps it elsewhere. */}
      <SheetContent className="flex w-full flex-col">
        <SheetHeader>
          <SheetTitle>My Cart</SheetTitle>

          <SheetDescription>
            Free shipping and 30-day returns on every order.
          </SheetDescription>
        </SheetHeader>

        {!cart || cart?.items?.length === 0 ? (
          <div className="text-center flex flex-col items-center gap-4 px-4">
            <ShoppingCart className="h-16" />
            <p className="text-center text-2xl font-bold">Your cart is empty.</p>
            {/* Never a dead end: the drawer is the one surface a browsing
                customer opens deliberately — leaving them with no way forward
                is a conversion door slammed shut. */}
            <Button asChild className="mt-2">
              <Link href="/shop" onClick={() => closeCart()}>
                Browse the shop
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grow flex px-4">
            <div className="flex flex-col justify-between w-full">
              <ul className="grow overflow-auto py-4">
                {cart?.items?.map((item, i) => {
                  const product = item.product
                  const variant = item.variant

                  if (typeof product !== 'object' || !item || !product || !product.slug)
                    return <React.Fragment key={i} />

                  const metaImage =
                    product.meta?.image && typeof product.meta?.image === 'object'
                      ? product.meta.image
                      : undefined

                  const firstGalleryImage =
                    typeof product.gallery?.[0]?.image === 'object'
                      ? product.gallery?.[0]?.image
                      : undefined

                  let image = firstGalleryImage || metaImage
                  let price = product.priceInUSD

                  const isVariant = Boolean(variant) && typeof variant === 'object'

                  if (isVariant) {
                    price = variant?.priceInUSD

                    const imageVariant = product.gallery?.find((item: GalleryItem) => {
                      if (!item.variantOption) return false
                      const variantOptionID =
                        typeof item.variantOption === 'object'
                          ? item.variantOption.id
                          : item.variantOption

                      const hasMatch = variant?.options?.some((option: VariantOptionRef) => {
                        if (typeof option === 'object') return option.id === variantOptionID
                        else return option === variantOptionID
                      })

                      return hasMatch
                    })

                    if (imageVariant && typeof imageVariant.image === 'object') {
                      image = imageVariant.image
                    }
                  }

                  return (
                    <li className="flex w-full flex-col" key={i}>
                      <div className="relative flex w-full flex-row justify-between px-1 py-4">
                        <div className="absolute z-40 -mt-2 ml-[55px]">
                          <DeleteItemButton item={item} />
                        </div>
                        <Link
                          className="z-30 flex min-w-0 flex-1 flex-row space-x-4 pr-3"
                          href={`/products/${(item.product as Product)?.slug}`}
                        >
                          <div className="relative h-16 w-16 cursor-pointer overflow-hidden rounded-md border border-border bg-product-surface">
                            {image?.url && (
                              <Image
                                alt={image?.alt || product?.title || ''}
                                // Cropping is worst at thumbnail size: a square
                                // crop of a wide pan is an unidentifiable
                                // close-up, and this is where the shopper is
                                // checking they picked the right thing.
                                className="h-full w-full object-contain p-1"
                                height={94}
                                src={image.url}
                                width={94}
                              />
                            )}
                          </div>

                          <div className="flex min-w-0 flex-1 flex-col text-base">
                            {/* Two lines is enough to recognise the item —
                                the full name lives one tap away on the PDP.
                                Unclamped, a supplier title renders one word
                                per line beside the price/qty column. */}
                            <span className="line-clamp-2 leading-tight">{product?.title}</span>
                            {isVariant && variant ? (
                              <p className="text-sm text-neutral-500 dark:text-neutral-400 capitalize">
                                {variant.options
                                  ?.map((option: VariantOptionRef) => {
                                    if (typeof option === 'object') return option.label
                                    return null
                                  })
                                  .join(', ')}
                              </p>
                            ) : null}
                          </div>
                        </Link>
                        <div className="flex h-16 shrink-0 flex-col justify-between">
                          {typeof price === 'number' && (
                            <Price
                              amount={price}
                              compareAtAmount={isVariant ? undefined : product.compareAtPriceInUSD}
                              // No `flex` here: it turns the price and the
                              // struck was-price into flex items and drops
                              // the text space between them, so they collide.
                              className="text-right text-sm"
                            />
                          )}
                          <div className="ml-auto flex h-9 flex-row items-center rounded-lg border">
                            <EditItemQuantityButton item={item} type="minus" />
                            <p className="w-6 text-center">
                              <span className="w-full text-sm">{item.quantity}</span>
                            </p>
                            <EditItemQuantityButton item={item} type="plus" />
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div className="px-4">
                <div className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
                  {savings > 0 && (
                    <div className="mb-1 flex items-center justify-between pt-1">
                      <p>Total savings</p>
                      <Price amount={savings} className="text-right" />
                    </div>
                  )}
                  {typeof cart?.subtotal === 'number' && (
                    <div className="mb-3 flex items-center justify-between border-b border-neutral-200 pb-1 pt-1 dark:border-neutral-700">
                      <p>Subtotal</p>
                      <Price
                        amount={cart?.subtotal}
                        className="text-right text-base text-black dark:text-white"
                      />
                    </div>
                  )}

                  {/* Straight into Stripe — the drawer above IS the review.
                      The label carries the signposting: the customer knows
                      they are heading to a payment provider before clicking. */}
                  <Button
                    className="w-full"
                    disabled={isRedirecting}
                    onClick={() => {
                      trackBeginCheckout(analyticsItems)
                      void startCheckout().then((error) => {
                        if (error) toast.error(error)
                      })
                    }}
                  >
                    {isRedirecting ? 'Opening secure checkout…' : 'Checkout with Stripe'}
                  </Button>
                  <p className="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    Payment, address and delivery details on Stripe&apos;s secure page.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
