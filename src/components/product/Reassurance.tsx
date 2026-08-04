import { RotateCcw, ShieldCheck, Truck, Lock } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import type { Product } from '@/payload-types'

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
 */

const SHOP_DEFAULT_RETURN_DAYS = 30

export const Reassurance: React.FC<{ product: Product }> = ({ product }) => {
  const returnDays = product.returnWindowDays ?? SHOP_DEFAULT_RETURN_DAYS
  const warrantyMonths = product.warrantyMonths
  const freeShipping = product.freeShippingEligible !== false

  const warrantyLabel =
    warrantyMonths && warrantyMonths >= 12
      ? `${Math.round(warrantyMonths / 12)}-year warranty`
      : warrantyMonths
        ? `${warrantyMonths}-month warranty`
        : null

  const items = [
    freeShipping && {
      icon: Truck,
      label: 'Free shipping',
      detail: 'No surprise costs at checkout',
    },
    returnDays > 0 && {
      icon: RotateCcw,
      label: `${returnDays}-day returns`,
      // The link matters as much as the claim — 60% of users look for the
      // policy here rather than in the footer.
      href: '/returns',
      detail: 'Read the policy',
    },
    warrantyLabel && {
      icon: ShieldCheck,
      label: warrantyLabel,
      detail: 'Covered against defects',
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
