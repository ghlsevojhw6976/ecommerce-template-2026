import { getDiscount } from '@/lib/commerce/discount'
import clsx from 'clsx'
import React from 'react'

/**
 * The one discount badge, used on every card surface. Percent framing
 * ("8% off") is the shop style — chosen by the owner over dollars-off.
 *
 * Accent pair, never alarm-red: this is a premium shop and the badge borrows
 * the same restrained accent as the cart count, so a sale reads as
 * merchandising, not a clearance bin. Background and foreground travel
 * together per the token rules.
 *
 * Self-hides when the product isn't genuinely on sale — callers pass the
 * product, not a label, so no surface can invent its own discount.
 */
export function DiscountBadge({
  product,
  className,
}: {
  product: Parameters<typeof getDiscount>[0]
  className?: string
}) {
  const discount = getDiscount(product)
  if (!discount) return null

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full bg-accent px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-accent-foreground',
        className,
      )}
    >
      {discount.badgeLabel}
    </span>
  )
}
