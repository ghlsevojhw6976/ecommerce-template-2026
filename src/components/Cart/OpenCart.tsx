import { Button } from '@/components/ui/button'
import { ShoppingBag } from 'lucide-react'
import React from 'react'

/**
 * The header cart trigger: bag icon + count badge, with the mono "Cart" label
 * kept on desktop.
 *
 * Icon AND label, not either alone — the bag silhouette is the most
 * scanned-for convention in commerce, the label removes any ambiguity, and
 * per Baymard the pair outperforms both. A bag rather than a trolley: this is
 * a premium shop, and the bag is the convention at the price point.
 *
 * The count is a real BADGE (accent pair — background and foreground travel
 * together per the token rules), not text in the sentence: "3 items waiting"
 * should register from the corner of an eye, which "CART • 3" in body mono
 * never did. Base colour is foreground, not muted: with items in it, the
 * cart is the most important pixel in the header.
 */
export function OpenCartButton({
  className,
  quantity,
  ...rest
}: {
  className?: string
  quantity?: number
}) {
  return (
    <Button
      aria-label={quantity ? `Cart, ${quantity} item${quantity === 1 ? '' : 's'}` : 'Cart'}
      variant="nav"
      size="clear"
      className="navLink relative flex h-11 items-center gap-2 text-foreground hover:cursor-pointer hover:text-muted-foreground"
      {...rest}
    >
      <span className="relative flex items-center">
        <ShoppingBag aria-hidden size={20} strokeWidth={1.5} />
        {quantity ? (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-medium leading-none text-accent-foreground">
            {quantity > 99 ? '99+' : quantity}
          </span>
        ) : null}
      </span>
      <span className="hidden md:inline">Cart</span>
    </Button>
  )
}
