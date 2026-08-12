import { RotateCcw, ShieldCheck, Truck, Lock } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import type { Product } from '@/payload-types'
import { GUARANTEE_NAME, GUARANTEE_TAGLINE } from '@/lib/commerce/guarantee'
import { getDiscount } from '@/lib/commerce/discount'
import { shippingCostCents, centsToFreeShipping } from '@/lib/commerce/shipping'

/**
 * The reassurance block that sits directly under the buy button.
 *
 * At €400–1200 the blocker is risk, not price: is it as described, can I send
 * it back, is there a warranty, is someone there if it goes wrong. Research is
 * consistent that answering those *before* the cart is what converts —
 * unexpected cost at checkout is the single biggest abandonment cause (39%),
 * and 15% abandon over an unsatisfactory return policy while 60% look for that
 * policy on the product page itself.
 *
 * Deliberately plain: no badge graphics, no shields with ticks. Fake-looking
 * trust badges undermine the thing they are trying to establish. Plain text
 * next to a thin icon reads as fact rather than decoration.
 *
 * The guarantee line is intentionally static, imported from one shared
 * constant rather than derived from a per-product field — 40tag is not an
 * authorized retailer for the brands it sells, so it cannot promise their
 * manufacturer warranties will be honored, and no product page may imply
 * otherwise. Every product shows the identical 40tag Guarantee line.
 *
 * The shipping line is priced against THIS product's own charged price
 * (post-discount, matching what a single-unit Buy Now would total) via the
 * shared lib/commerce/shipping.ts formula — the same one checkout actually
 * charges. Below the free threshold, the flat fee and the exact remaining
 * amount to qualify are shown here, before the customer ever reaches the
 * cart — the whole point of putting this box under the buy button.
 */

const SHOP_DEFAULT_RETURN_DAYS = 30

export const Reassurance: React.FC<{
  product: Product
  freeShippingThreshold?: number | null
  flatShippingFee?: number | null
}> = ({ product, freeShippingThreshold, flatShippingFee }) => {
  const returnDays = product.returnWindowDays ?? SHOP_DEFAULT_RETURN_DAYS
  const freeShippingEligible = product.freeShippingEligible !== false

  const chargedPrice = getDiscount(product)?.price ?? product.priceInUSD ?? 0
  const policy = { freeShippingThreshold, flatShippingFee }
  const shippingAmount = freeShippingEligible
    ? shippingCostCents(chargedPrice, policy)
    : (flatShippingFee ?? 0)
  const amountToFree = freeShippingEligible ? centsToFreeShipping(chargedPrice, policy) : 0
  const thresholdDollars =
    typeof freeShippingThreshold === 'number' ? (freeShippingThreshold / 100).toFixed(0) : null

  const items = [
    {
      icon: Truck,
      label:
        shippingAmount === 0 ? 'Free shipping' : `$${(shippingAmount / 100).toFixed(2)} flat shipping`,
      detail:
        shippingAmount === 0
          ? 'No surprise costs at checkout'
          : thresholdDollars
            ? `Free over $${thresholdDollars} — add $${(amountToFree / 100).toFixed(2)} more to qualify`
            : 'Shown here, not just at checkout',
    },
    returnDays > 0 && {
      icon: RotateCcw,
      label: `${returnDays}-day returns`,
      // The link matters as much as the claim — 60% of users look for the
      // policy here rather than in the footer.
      href: '/returns',
      detail: 'Read the policy',
    },
    {
      icon: ShieldCheck,
      label: `Backed by the ${GUARANTEE_NAME}`,
      detail: GUARANTEE_TAGLINE,
    },
    {
      icon: Lock,
      label: 'Secure checkout',
      detail: 'Encrypted payment',
    },
  ].filter(Boolean) as {
    icon: React.ElementType
    label: string
    detail: string
    href?: string
  }[]

  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border pt-5 sm:grid-cols-2">
      {items.map(({ icon: Icon, label, detail, href }) => (
        <li className="flex items-start gap-2.5" key={label}>
          <Icon aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" size={16} strokeWidth={1.5} />
          <div className="min-w-0">
            <p className="text-sm leading-snug text-foreground">{label}</p>
            {href ? (
              <Link
                className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                href={href}
              >
                {detail}
              </Link>
            ) : (
              <p className="text-xs leading-snug text-muted-foreground">{detail}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
