import Link from 'next/link'
import React from 'react'

import type { NavCategory } from '@/utilities/getNavCategories'
import { cn } from '@/utilities/cn'

/**
 * Category sidebar.
 *
 * Server component and plain links rather than a filter widget: each category
 * is a real, shareable, indexable URL. A JavaScript filter that mutates a grid
 * in place gives you one page for the whole catalogue, which is worse for both
 * search and for anyone sending a link to a friend.
 *
 * The active branch stays expanded so the user can see where they are and step
 * back up a level — collapsing it is how people lose their place.
 */
/** Children listed under an expanded category before linking to the rest. */
const MAX_CHILDREN = 12

/**
 * Phone variant of the category nav: horizontally scrollable chips instead of
 * the stacked sidebar. Stacked, the full list pushes the first product a
 * whole viewport below the fold — a shopper on a phone scrolls through ~16
 * links before seeing a single product. Same real anchors, so nothing about
 * crawlability changes; when the shopper is inside a branch its children get
 * a second chip row.
 */
export const CategoryChips: React.FC<{
  categories: NavCategory[]
  activeSlug?: string
}> = ({ categories, activeSlug }) => {
  if (!categories.length) return null

  const isActive = (slug: string) => slug === activeSlug
  const activeBranch = categories.find(
    (category) =>
      isActive(category.slug) || category.children.some((child) => isActive(child.slug)),
  )

  const chipClass = (active: boolean) =>
    cn(
      'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors',
      active
        ? 'border-foreground bg-foreground text-background'
        : 'border-border text-muted-foreground hover:text-foreground',
    )

  // Edge-to-edge scroll: the negative margins let chips run under the
  // container padding so the row visibly continues off-screen — the scroll
  // affordance IS the cut-off chip.
  const rowClass =
    '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

  return (
    <nav aria-label="Filter by category" className="flex flex-col gap-2">
      <div className={rowClass}>
        <Link className={chipClass(!activeSlug)} href="/shop">
          All products
        </Link>
        {categories.map((category) => (
          <Link
            aria-current={isActive(category.slug) ? 'page' : undefined}
            className={chipClass(isActive(category.slug))}
            href={`/shop/${category.slug}`}
            key={category.id}
          >
            {category.title}
          </Link>
        ))}
      </div>

      {activeBranch && activeBranch.children.length > 0 && (
        <div className={rowClass}>
          {activeBranch.children.slice(0, MAX_CHILDREN).map((child) => (
            <Link
              aria-current={isActive(child.slug) ? 'page' : undefined}
              className={chipClass(isActive(child.slug))}
              href={`/shop/${child.slug}`}
              key={child.id}
            >
              {child.title}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}

export const CategoryFilter: React.FC<{
  categories: NavCategory[]
  activeSlug?: string
}> = ({ categories, activeSlug }) => {
  if (!categories.length) return null

  const isActive = (slug: string) => slug === activeSlug
  const branchIsActive = (category: NavCategory) =>
    isActive(category.slug) || category.children.some((child) => isActive(child.slug))

  return (
    <nav aria-label="Filter by category">
      <h2 className="mb-4 text-xs uppercase tracking-[0.12em] text-muted-foreground">Categories</h2>

      <ul className="flex flex-col gap-1">
        <li>
          <Link
            className={cn(
              'block py-1.5 text-sm transition-colors hover:text-foreground',
              !activeSlug ? 'text-foreground' : 'text-muted-foreground',
            )}
            href="/shop"
          >
            All products
          </Link>
        </li>

        {categories.map((category) => {
          const expanded = branchIsActive(category)

          return (
            <li key={category.id}>
              <Link
                aria-current={isActive(category.slug) ? 'page' : undefined}
                className={cn(
                  'block py-1.5 text-sm transition-colors hover:text-foreground',
                  isActive(category.slug) ? 'text-foreground' : 'text-muted-foreground',
                )}
                href={`/shop/${category.slug}`}
              >
                {category.title}
              </Link>

              {category.children.length > 0 && expanded && (
                <ul className="mb-1 ml-1 flex flex-col border-l border-border pl-3">
                  {category.children.slice(0, MAX_CHILDREN).map((child) => (
                    <li key={child.id}>
                      <Link
                        aria-current={isActive(child.slug) ? 'page' : undefined}
                        className={cn(
                          'block py-1 text-sm transition-colors hover:text-foreground',
                          isActive(child.slug) ? 'text-foreground' : 'text-muted-foreground',
                        )}
                        href={`/shop/${child.slug}`}
                      >
                        {child.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
