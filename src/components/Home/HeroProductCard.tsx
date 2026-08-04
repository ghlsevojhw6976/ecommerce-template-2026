import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import type { Media as MediaType, Product } from '@/payload-types'
import { Media } from '@/components/Media'
import { Price } from '@/components/Price'
import { DiscountBadge } from '@/components/product/DiscountBadge'
import { Rating } from '@/components/product/Rating'

/**
 * The product card that occupies the other half of the hero.
 *
 * Solves two problems at once. Visually it fills space that was empty, which
 * was making the hero read as sparse rather than confident. Commercially it
 * answers "what do you actually sell, and what does it cost" above the fold —
 * a homepage that only makes a brand statement leaves a visitor one more click
 * from anything they can buy.
 *
 * Deliberately shows the real price and rating. Vague hero imagery with a
 * "Discover" button performs worse than a concrete product with a number on it:
 * price is the question everyone is silently asking.
 */
export const HeroProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const image = product.gallery?.[0]?.image
  const hasImage = image && typeof image === 'object'

  return (
    <Link
      className="group block"
      href={`/products/${product.slug}`}
      aria-label={`View ${product.title}`}
    >
      <div className="relative overflow-hidden bg-product-surface">
        {/* Self-hides off-sale. */}
        <DiscountBadge className="absolute left-3 top-3 z-10" product={product} />
        {hasImage ? (
          <Media
            // Contained, not cropped. This is the one product on the page the
            // shop is choosing to lead with, and 4:5 crops a wide appliance
            // shot hardest of any ratio in the layout.
            className="relative aspect-[4/5] p-6"
            imgClassName="h-full w-full object-contain transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]"
            priority
            resource={image as MediaType}
          />
        ) : (
          <div className="aspect-[4/5] border border-border bg-muted" />
        )}

        {/* Caption sits on the image rather than below it, so the hero column
            has a single silhouette instead of a picture with a text tail. */}
        <div className="absolute inset-x-0 bottom-0 bg-background/92 p-5 backdrop-blur-sm">
          <p className="mb-1 text-2xs uppercase tracking-[0.14em] text-muted-foreground">
            {product.brand || 'Featured'}
          </p>

          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-lg leading-snug">{product.title}</h2>
            {typeof product.priceInUSD === 'number' && (
              <div className="numeric shrink-0 text-sm">
                <Price
                  amount={product.priceInUSD}
                  compareAtAmount={product.compareAtPriceInUSD}
                />
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-4">
            <Rating average={product.ratingAverage} count={product.ratingCount} size="sm" />
            <span className="flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
              View
              <ArrowRight
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
                size={13}
                strokeWidth={1.75}
              />
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
