import type { Product, Variant } from '@/payload-types'

import Link from 'next/link'
import React from 'react'
import clsx from 'clsx'
import { Media } from '@/components/Media'
import { Price } from '@/components/Price'
import { DiscountBadge } from '@/components/product/DiscountBadge'
import { Rating } from '@/components/product/Rating'

type Props = {
  product: Partial<Product>
}

export const ProductGridItem: React.FC<Props> = ({ product }) => {
  const { gallery, priceInUSD, title } = product

  // Every product owns its price — siblings are separate products now.
  const price = priceInUSD

  const image =
    gallery?.[0]?.image && typeof gallery[0]?.image !== 'string' ? gallery[0]?.image : false

  return (
    <Link className="relative inline-block h-full w-full group" href={`/products/${product.slug}`}>
      {/* Self-hides off-sale. Overlaid on the image corner so the badge never
          adds card height — cards in one row must stay aligned. */}
      <DiscountBadge className="absolute left-2 top-2 z-10" product={product} />
      {/* Always reserve the image slot. Rendering nothing when a product has
          no image collapses the card to a bare line of text and — worse —
          shifts every card below it, which is a CLS penalty as well as ugly. */}
      {image ? (
        <div className="overflow-hidden bg-product-surface">
          <Media
            className="relative aspect-square p-4"
            imgClassName={clsx(
              // object-CONTAIN, not cover. Cover fills the square by cropping,
              // which lops the handles off a pan and the top off a tall
              // appliance — and on a catalogue of mixed-aspect supplier shots
              // it reads as the image bursting out of the tile. Contain shows
              // the whole product; the padding keeps it off the edges so it
              // sits in the tile rather than straining against it.
              'h-full w-full object-contain',
              'transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.03]',
            )}
            resource={image}
          />
        </div>
      ) : (
        <div className="aspect-square border border-border bg-muted transition-colors group-hover:bg-secondary" />
      )}

      {/* Phones get the stacked card anatomy: title, then price on its own
          line. In a two-up mobile grid the card is ~170px wide — the
          side-by-side baseline row squeezes a long supplier title into a
          skinny 8-line column with the price floating at top-right. From sm:
          up the cards are wide enough for the original single-row layout. */}
      <div className="mt-3 flex flex-col gap-1 sm:mt-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h3 className="line-clamp-3 font-display text-sm leading-snug sm:line-clamp-none sm:text-base">
          {title}
        </h3>

        {typeof price === 'number' && (
          <div className="numeric shrink-0 text-sm">
            <Price amount={price} compareAtAmount={product.compareAtPriceInUSD} />
          </div>
        )}
      </div>

      {/* Self-hides when the product has no reviews — see Rating. */}
      <Rating
        average={product.ratingAverage}
        className="mt-1.5"
        count={product.ratingCount}
        size="sm"
      />
    </Link>
  )
}
