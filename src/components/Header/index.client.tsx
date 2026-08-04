'use client'
import { CMSLink } from '@/components/Link'
import { Cart } from '@/components/Cart'
import { OpenCartButton } from '@/components/Cart/OpenCart'
import Link from 'next/link'
import React, { Suspense } from 'react'

import { CategoryNav } from './CategoryNav'
import { MobileMenu } from './MobileMenu'
import type { Header } from 'src/payload-types'
import type { NavCategory } from '@/utilities/getNavCategories'

import { Search as SearchIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/utilities/cn'

type Props = {
  header: Header
  /** Rendered on the server so the Company global never reaches the browser. */
  logo: React.ReactNode
  categories: NavCategory[]
  storeName: string
}

export function HeaderClient({ header, logo, categories, storeName }: Props) {
  const menu = header.navItems || []
  const pathname = usePathname()

  return (
    <div className="relative z-20 border-b">
      <nav className="flex items-center md:items-end justify-between container pt-2">
        <div className="block flex-none md:hidden">
          <Suspense fallback={null}>
            <MobileMenu categories={categories} menu={menu} storeName={storeName} />
          </Suspense>
        </div>
        <div className="flex w-full items-end justify-between">
          {/* Flexible, not a fixed third: a longer wordmark ("shop.com") plus
              a bigger mark must push the category nav over, never under it. */}
          <div className="flex w-full items-end gap-6 md:min-w-0 md:flex-1">
            <Link
              className="flex w-full shrink-0 items-center justify-center pt-4 pb-4 md:w-auto"
              href="/"
            >
              {logo}
            </Link>
            <CategoryNav categories={categories} />
            {menu.length ? (
              <ul className="hidden gap-4 text-sm md:flex md:items-center">
                {menu.map((item) => (
                  <li key={item.id}>
                    <CMSLink
                      {...item.link}
                      size={'clear'}
                      className={cn('relative navLink', {
                        active:
                          item.link.url && item.link.url !== '/'
                            ? pathname.includes(item.link.url)
                            : false,
                      })}
                      appearance="nav"
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-4 md:w-1/3">
            <Link
              aria-label="Search products"
              className="hidden p-2 transition-colors hover:text-muted-foreground md:block"
              href="/shop"
            >
              <SearchIcon size={18} strokeWidth={1.5} />
            </Link>
            <Suspense fallback={<OpenCartButton />}>
              <Cart />
            </Suspense>
          </div>
        </div>
      </nav>
    </div>
  )
}
