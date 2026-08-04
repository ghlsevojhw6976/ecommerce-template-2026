import Link from 'next/link'
import React from 'react'

import { Media } from '@/components/Media'
import type { NavCategory } from '@/utilities/getNavCategories'
import { cn } from '@/utilities/cn'

/**
 * Category entry points — the most valuable block on the homepage for anyone
 * who arrived without a specific product in mind.
 *
 * ── Handling any number of categories ───────────────────────────────────
 * A fixed three-column grid leaves a ragged hole whenever the count is not a
 * multiple of three — five categories rendered as 3 + 2 with an empty cell,
 * which reads as a mistake.
 *
 * Instead the column count is chosen from how many there actually are, and the
 * first tile is given extra prominence when the layout allows. That also fixes
 * the flatness of an all-equal grid: a category page with a clear entry point
 * outperforms six identical squares.
 */

const columnsFor = (count: number): string => {
  if (count <= 2) return 'grid-cols-1 sm:grid-cols-2'
  if (count === 4) return 'grid-cols-2 lg:grid-cols-4'
  // 3, 5, 6 all resolve cleanly in three columns — 5 works because the lead
  // tile below takes two of them, leaving 1 + 3.
  return 'grid-cols-2 lg:grid-cols-3'
}

export const CategoryGrid: React.FC<{
  categories: NavCategory[]
  heading?: string
}> = ({ categories, heading = 'Shop by category' }) => {
  const shown = categories.slice(0, 6)
  if (!shown.length) return null

  const columns = columnsFor(shown.length)
  // Only promote a lead tile when the remainder still fills its rows.
  const promoteFirst = shown.length === 5

  return (
    <section aria-labelledby="shop-by-category" className="container py-[var(--space-section)]">
      <div className="mb-[var(--space-block)] flex items-baseline justify-between gap-6">
        <h2 className="text-2xl md:text-3xl" id="shop-by-category">
          {heading}
        </h2>
        <Link
          className="whitespace-nowrap text-xs uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
          href="/shop"
        >
          All products
        </Link>
      </div>

      <ul className={cn('grid gap-x-4 gap-y-8 md:gap-x-6', columns)}>
        {shown.map((category, i) => {
          const lead = promoteFirst && i === 0

          return (
            <li
              // Columns only. Adding a row-span here made the lead tile taller
              // than the viewport.
              className={cn('reveal', lead && 'col-span-2')}
              key={category.id}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <Link className="group block h-full" href={`/shop/${category.slug}`}>
                {category.image ? (
                  <div className="mb-3 overflow-hidden bg-product-surface">
                    <Media
                      className={cn(
                        // The lead spans two columns, so to finish level with the 4:3 tile
                        // beside it its ratio has to be ~2×(4/3) plus the gap.
                        // 16/9 leaves it noticeably taller and the row bottoms ragged.
                        lead ? 'aspect-[8/3]' : 'aspect-[4/3]',
                        // These are product photographs standing in for category
                        // art, so they follow the same no-crop rule. It matters
                        // most on the 8:3 lead tile, where filling the width
                        // would slice the top and bottom off the product.
                        lead ? 'px-6 py-3' : 'p-4',
                      )}
                      imgClassName="h-full w-full object-contain transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-105"
                      resource={category.image}
                    />
                  </div>
                ) : (
                  <div
                    className={cn(
                      'mb-3 border border-border bg-muted transition-colors group-hover:bg-secondary',
                      // The lead spans two columns, so to finish level with the 4:3 tile
                      // beside it its ratio has to be ~2×(4/3) plus the gap.
                      // 16/9 leaves it noticeably taller and the row bottoms ragged.
                      lead ? 'aspect-[8/3]' : 'aspect-[4/3]',
                    )}
                  />
                )}

                <h3
                  className={cn(
                    'font-display leading-tight',
                    lead ? 'text-xl md:text-2xl' : 'text-base sm:text-lg',
                  )}
                >
                  {category.title}
                </h3>

                {/* One line, clamped: three joined child names wrap into a
                    paragraph on a half-width phone tile and the tile heights
                    go ragged. */}
                {category.children.length > 0 && (
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {category.children
                      .slice(0, lead ? 5 : 3)
                      .map((c) => c.title)
                      .join(' · ')}
                  </p>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
