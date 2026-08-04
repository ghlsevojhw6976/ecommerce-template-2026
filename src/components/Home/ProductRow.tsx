import Link from 'next/link'
import React from 'react'

import type { Product } from '@/payload-types'
import { Grid } from '@/components/Grid'
import { ProductGridItem } from '@/components/ProductGridItem'
import { cn } from '@/utilities/cn'

/**
 * A row of products on the homepage.
 *
 * ── Why a minimum ───────────────────────────────────────────────────────
 * A single product dropped into a three-column grid sits in the left third
 * with two empty columns beside it, which reads as a broken page rather than a
 * small catalogue. Every new shop hits this on its first day.
 *
 * Below the minimum the section hides entirely — an absent section looks
 * deliberate, a a lonely card does not. The catalogue is still reachable
 * through the categories and the nav.
 *
 * Above it, the column count follows the number of items so the last row is
 * never ragged.
 */

const MINIMUM = 3

const columnsFor = (count: number): string => {
  if (count >= 8) return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
  if (count % 4 === 0) return 'grid-cols-2 lg:grid-cols-4'
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
}

export const ProductRow: React.FC<{
  products: Product[]
  heading: string
  href?: string
  linkLabel?: string
  className?: string
}> = ({ products, heading, href = '/shop', linkLabel = 'See everything', className }) => {
  if (products.length < MINIMUM) return null

  // Trim to a whole number of rows so the grid never ends mid-row.
  const perRow = products.length >= 8 ? 4 : 3
  const shown = products.slice(0, Math.floor(products.length / perRow) * perRow || products.length)

  return (
    <section aria-labelledby="product-row-heading" className={cn('container', className)}>
      <div className="mb-[var(--space-block)] flex items-baseline justify-between gap-6">
        <h2 className="text-2xl md:text-3xl" id="product-row-heading">
          {heading}
        </h2>
        <Link
          className="whitespace-nowrap text-xs uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
          href={href}
        >
          {linkLabel}
        </Link>
      </div>

      <Grid className={cn('grid gap-x-6 gap-y-10', columnsFor(shown.length))}>
        {shown.map((product) => (
          <ProductGridItem key={product.id} product={product} />
        ))}
      </Grid>
    </section>
  )
}
