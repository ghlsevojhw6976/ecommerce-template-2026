'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import React, { useCallback, useRef, useState } from 'react'

import type { NavCategory } from '@/utilities/getNavCategories'
import { cn } from '@/utilities/cn'

/**
 * Category navigation with a mega-menu for categories that have children.
 *
 * Opens on hover with a small close delay, because the diagonal path from a
 * trigger to the far side of its panel briefly leaves both — closing instantly
 * makes the menu feel like it is fighting the cursor.
 *
 * Also opens on click and on keyboard focus. Hover-only menus are unusable by
 * keyboard and on touch, where there is no hover state at all.
 */
/**
 * How many top-level categories fit before the row collides with the cart.
 * A real catalogue can have dozens; the rest stay reachable via "All".
 */
const MAX_TOP_LEVEL = 5

/**
 * Children shown per mega-menu before falling back to "All".
 *
 * The imported taxonomy puts 73 leaf categories under Home & Kitchen. A panel
 * listing all of them is a wall of text nobody reads — categories are ordered
 * by product volume, so the busiest ones earn the slots.
 */
const MAX_CHILDREN = 8

export const CategoryNav: React.FC<{ categories: NavCategory[] }> = ({ categories }) => {
  const [openId, setOpenId] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const open = useCallback((id: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenId(id)
  }, [])

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenId(null), 120)
  }, [])

  if (!categories.length) return null

  // Overflow rather than wrap: a wrapped nav pushes the header to two rows and
  // knocks the logo and cart out of alignment. The importer created 8
  // top-level categories, which overran the row and overlapped the cart.
  const shown = categories.slice(0, MAX_TOP_LEVEL)
  const overflow = categories.slice(MAX_TOP_LEVEL)

  return (
    <nav aria-label="Product categories" className="hidden min-w-0 md:block">
      <ul className="flex items-center gap-6">
        {shown.map((category) => {
          const id = String(category.id)
          const hasChildren = category.children.length > 0
          const isOpen = openId === id

          return (
            <li
              className="relative"
              key={id}
              onMouseEnter={() => hasChildren && open(id)}
              onMouseLeave={scheduleClose}
            >
              <Link
                aria-expanded={hasChildren ? isOpen : undefined}
                aria-haspopup={hasChildren || undefined}
                className={cn(
                  // nowrap: a two-word category otherwise wraps and knocks the
                  // whole header row off its baseline.
                  'flex items-center gap-1 whitespace-nowrap py-3 text-sm transition-colors',
                  'hover:text-muted-foreground',
                  isOpen && 'text-muted-foreground',
                )}
                href={`/shop/${category.slug}`}
                onFocus={() => hasChildren && open(id)}
              >
                {category.title}
                {hasChildren && (
                  <ChevronDown
                    aria-hidden
                    className={cn('transition-transform', isOpen && 'rotate-180')}
                    size={13}
                    strokeWidth={1.75}
                  />
                )}
              </Link>

              {hasChildren && isOpen && (
                <div
                  className={cn(
                    'absolute left-0 top-full z-30 min-w-[16rem] pt-1',
                    'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1',
                  )}
                  onMouseEnter={() => open(id)}
                  onMouseLeave={scheduleClose}
                >
                  <div className="border border-border bg-background p-2 shadow-[var(--elevation-overlay)]">
                    <ul>
                      {category.children.slice(0, MAX_CHILDREN).map((child) => (
                        <li key={child.id}>
                          <Link
                            className="block px-3 py-2 text-sm transition-colors hover:bg-muted"
                            href={`/shop/${child.slug}`}
                            onClick={() => setOpenId(null)}
                          >
                            {child.title}
                          </Link>
                        </li>
                      ))}
                      <li className="mt-1 border-t border-border pt-1">
                        <Link
                          className="block px-3 py-2 text-xs uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
                          href={`/shop/${category.slug}`}
                          onClick={() => setOpenId(null)}
                        >
                          {category.children.length > MAX_CHILDREN
                            ? `All ${category.children.length} in ${category.title}`
                            : `All ${category.title}`}
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </li>
          )
        })}

        {overflow.length > 0 && (
          <li className="relative" onMouseEnter={() => open('__more')} onMouseLeave={scheduleClose}>
            <button
              aria-expanded={openId === '__more'}
              aria-haspopup
              className={cn(
                'flex items-center gap-1 whitespace-nowrap py-3 text-sm transition-colors',
                'hover:text-muted-foreground',
                openId === '__more' && 'text-muted-foreground',
              )}
              onFocus={() => open('__more')}
              type="button"
            >
              More
              <ChevronDown
                aria-hidden
                className={cn('transition-transform', openId === '__more' && 'rotate-180')}
                size={13}
                strokeWidth={1.75}
              />
            </button>

            {openId === '__more' && (
              <div
                className="absolute right-0 top-full z-30 min-w-[14rem] pt-1"
                onMouseEnter={() => open('__more')}
                onMouseLeave={scheduleClose}
              >
                <div className="border border-border bg-background p-2 shadow-[var(--elevation-overlay)]">
                  <ul>
                    {overflow.map((category) => (
                      <li key={category.id}>
                        <Link
                          className="block px-3 py-2 text-sm transition-colors hover:bg-muted"
                          href={`/shop/${category.slug}`}
                          onClick={() => setOpenId(null)}
                        >
                          {category.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </li>
        )}
      </ul>
    </nav>
  )
}
