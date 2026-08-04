import configPromise from '@payload-config'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import Link from 'next/link'
import React from 'react'

import type { Category } from '@/payload-types'
import { Grid } from '@/components/Grid'
import { ProductGridItem } from '@/components/ProductGridItem'
import { CategoryFilter } from '@/components/Shop/CategoryFilter'
import { ALLOWED_SORTS, SortSelect } from '@/components/Shop/SortSelect'
import { getNavCategories } from '@/utilities/getNavCategories'

/**
 * /search — the DYNAMIC counterpart of the static /shop pages.
 *
 * Everything query-driven lives here: text search (?q=), sort (?sort=,
 * optionally scoped to a category via ?category=), and their pagination.
 * The static routes cannot see query strings at all, so this split is what
 * lets the browsing surface be cached while views-of-a-list stay live.
 *
 * Never indexed: internal search is an infinite duplicate-content
 * generator, and a sorted category view is the same list as the canonical
 * category page.
 */

const PER_PAGE = 48

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  title: 'Search',
}

type SearchParams = { [key: string]: string | string[] | undefined }

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const query = await searchParams
  const searchValue = first(query.q)
  const categorySlug = first(query.category)
  const requestedSort = first(query.sort)
  const pageRaw = Number(first(query.page))
  const page = Number.isInteger(pageRaw) && pageRaw > 1 ? pageRaw : 1

  const payload = await getPayload({ config: configPromise })

  let category: Category | null = null
  if (categorySlug) {
    const found = await payload.find({
      collection: 'categories',
      depth: 0,
      limit: 1,
      where: { slug: { equals: categorySlug } },
    })
    category = (found.docs[0] as Category) ?? null
  }

  let categoryIds: (number | string)[] = []
  if (category) {
    const children = await payload.find({
      collection: 'categories',
      depth: 0,
      limit: 0,
      pagination: false,
      where: { parent: { equals: category.id } },
    })
    categoryIds = [category.id, ...children.docs.map((c) => c.id)]
  }

  // Never pass a user-supplied sort straight into the query — an arbitrary
  // field name lets a visitor order the catalogue by anything in the collection.
  const sort = requestedSort && ALLOWED_SORTS.includes(requestedSort) ? requestedSort : 'title'

  const [products, navCategories] = await Promise.all([
    payload.find({
      collection: 'products',
      depth: 1,
      draft: false,
      limit: PER_PAGE,
      page,
      overrideAccess: false,
      sort,
      where: {
        and: [
          { _status: { equals: 'published' } },
          ...(searchValue
            ? [
                {
                  or: [
                    { title: { like: searchValue } },
                    { shortDescription: { like: searchValue } },
                  ],
                },
              ]
            : []),
          ...(categoryIds.length ? [{ categories: { in: categoryIds } }] : []),
        ],
      },
    }),
    getNavCategories(),
  ])

  const count = products.totalDocs
  const heading = searchValue
    ? `Results for “${searchValue}”`
    : (category?.title ?? 'All products')

  const pageHref = (target: number): string => {
    const params = new URLSearchParams()
    if (searchValue) params.set('q', searchValue)
    if (categorySlug) params.set('category', categorySlug)
    if (requestedSort) params.set('sort', requestedSort)
    if (target > 1) params.set('page', String(target))
    return `/search?${params.toString()}`
  }

  return (
    <div className="container py-[var(--space-block)]">
      <header className="mb-[var(--space-block)]">
        <h1 className="text-3xl md:text-4xl">{heading}</h1>
        <p className="numeric mt-4 text-xs text-muted-foreground">
          {count} {count === 1 ? 'product' : 'products'}
        </p>
      </header>

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-16">
        <aside className="lg:w-56 lg:shrink-0">
          <CategoryFilter activeSlug={categorySlug} categories={navCategories} />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex items-center justify-end border-b border-border pb-4">
            <React.Suspense fallback={null}>
              <SortSelect categorySlug={categorySlug} />
            </React.Suspense>
          </div>

          {products.docs.length > 0 ? (
            <Grid className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3">
              {products.docs.map((product) => (
                <ProductGridItem key={product.id} product={product} />
              ))}
            </Grid>
          ) : (
            <div className="py-16 text-center">
              <p className="text-base">Nothing here yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try a different search, or browse the categories.
              </p>
            </div>
          )}

          {products.totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-12 flex items-center justify-between border-t border-border pt-6"
            >
              {products.hasPrevPage ? (
                <Link className="text-sm underline underline-offset-4" href={pageHref(page - 1)}>
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="numeric text-xs text-muted-foreground">
                Page {products.page} of {products.totalPages}
              </span>
              {products.hasNextPage ? (
                <Link className="text-sm underline underline-offset-4" href={pageHref(page + 1)}>
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
