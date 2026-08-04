import configPromise from '@payload-config'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import type { Category } from '@/payload-types'
import { Grid } from '@/components/Grid'
import { ProductGridItem } from '@/components/ProductGridItem'
import { CategoryChips, CategoryFilter } from '@/components/Shop/CategoryFilter'
import { SortSelect } from '@/components/Shop/SortSelect'
import { companyName, getCompany } from '@/utilities/getCompany'
import { getNavCategories } from '@/utilities/getNavCategories'

/**
 * /shop, /shop/[category], and their paginated variants — STATIC pages
 * (Shopify-style: storefront served from cache, purged on content change by
 * the hooks in src/hooks/revalidateStorefront.ts).
 *
 * Being static is why pagination lives in the PATH (/shop/cookware/page/2):
 * statically served routes ignore query strings entirely, so a ?page= or
 * ?sort= here would silently do nothing. Anything genuinely query-driven —
 * search, sort — lives on the dynamic /search route instead; the sort
 * control on this page navigates there.
 *
 * Segment shapes handled by the optional catch-all:
 *   []                      → all products, page 1
 *   ['page', '2']           → all products, page 2
 *   ['cookware']            → category, page 1
 *   ['cookware', 'page', '2'] → category, page 2
 */

const PER_PAGE = 48

// Time-based safety net under the on-demand hooks: catches anything that
// changes a listing without firing one (e.g. cross-product effects).
export const revalidate = 3600

type Props = {
  params: Promise<{ category?: string[] }>
}

type ParsedPath = { slug?: string; page: number } | null

const parseSegments = (segments: string[] | undefined): ParsedPath => {
  const parts = segments ?? []
  if (parts.length === 0) return { page: 1 }
  if (parts.length === 1) return { slug: parts[0], page: 1 }
  if (parts.length === 2 && parts[0] === 'page') {
    const n = Number(parts[1])
    return Number.isInteger(n) && n > 1 ? { page: n } : null
  }
  if (parts.length === 3 && parts[1] === 'page') {
    const n = Number(parts[2])
    return Number.isInteger(n) && n > 1 ? { slug: parts[0], page: n } : null
  }
  return null
}

const findCategory = async (slug: string): Promise<Category | null> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1,
    where: { slug: { equals: slug } },
  })
  return (found.docs[0] as Category) ?? null
}

/** Prerender /shop and every category's page 1. Deeper pages build on first
    request and are then cached like the rest (dynamicParams default). */
export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const categories = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 0,
    pagination: false,
    select: { slug: true },
  })

  return [
    { category: [] },
    ...categories.docs
      .filter((category) => category.slug)
      .map((category) => ({ category: [category.slug as string] })),
  ]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: segments } = await params
  const parsed = parseSegments(segments)
  if (!parsed) return {}

  const category = parsed.slug ? await findCategory(parsed.slug) : null
  if (parsed.slug && !category) return {}

  const baseTitle = category?.title ?? 'Shop'
  const title = parsed.page > 1 ? `${baseTitle} — Page ${parsed.page}` : baseTitle
  const description = category?.description || 'Browse the full range.'

  const basePath = category ? `/shop/${category.slug}` : '/shop'
  const canonical = parsed.page > 1 ? `${basePath}/page/${parsed.page}` : basePath

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      siteName: companyName(await getCompany()),
      url: canonical,
    },
  }
}

export default async function ShopPage({ params }: Props) {
  const { category: segments } = await params
  const parsed = parseSegments(segments)
  if (!parsed) notFound()

  const payload = await getPayload({ config: configPromise })

  const category = parsed.slug ? await findCategory(parsed.slug) : null
  // A dead category slug is a real 404, not an empty grid pretending to be a page.
  if (parsed.slug && !category) notFound()

  // A parent category shows everything beneath it. Nobody clicking "Cookware"
  // wants only products tagged Cookware and none of the actual pans.
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

  const [products, navCategories] = await Promise.all([
    payload.find({
      collection: 'products',
      depth: 1,
      draft: false,
      limit: PER_PAGE,
      page: parsed.page,
      overrideAccess: false,
      sort: 'title',
      where: {
        and: [
          { _status: { equals: 'published' } },
          ...(categoryIds.length ? [{ categories: { in: categoryIds } }] : []),
        ],
      },
    }),
    getNavCategories(),
  ])

  // Beyond the last page: 404 rather than an empty page-37 shell.
  if (parsed.page > 1 && products.docs.length === 0) notFound()

  const count = products.totalDocs
  const heading = category?.title ?? 'All products'
  const basePath = category ? `/shop/${category.slug}` : '/shop'
  const pageHref = (target: number): string =>
    target > 1 ? `${basePath}/page/${target}` : basePath

  return (
    <div className="container py-[var(--space-block)]">
      <header className="mb-[var(--space-block)]">
        <h1 className="text-3xl md:text-4xl">{heading}</h1>

        {/* Category copy is worth writing — a category page with real text
            ranks; one with a bare product grid does not. */}
        {category?.description && (
          <p className="prose-measure mt-4 text-base leading-relaxed text-muted-foreground">
            {category.description}
          </p>
        )}

        <p className="numeric mt-4 text-xs text-muted-foreground">
          {count} {count === 1 ? 'product' : 'products'}
        </p>
      </header>

      <div className="flex flex-col gap-5 lg:flex-row lg:gap-16">
        <aside className="lg:w-56 lg:shrink-0">
          {/* Same links, two shapes: a scrollable chip strip on phones and
              tablets, the stacked sidebar once there's a real column for it. */}
          <div className="lg:hidden">
            <CategoryChips activeSlug={parsed.slug} categories={navCategories} />
          </div>
          <div className="hidden lg:block">
            <CategoryFilter activeSlug={parsed.slug} categories={navCategories} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex items-center justify-end border-b border-border pb-4">
            {/* Sorting is a different VIEW of the same list — it happens on
                the dynamic /search route; this control navigates there. The
                Suspense boundary is REQUIRED: useSearchParams inside a
                statically prerendered page fails the build without one. */}
            <React.Suspense fallback={null}>
              <SortSelect categorySlug={parsed.slug} />
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
              <p className="mt-2 text-sm text-muted-foreground">Try another category.</p>
            </div>
          )}

          {/* Real anchor pagination — crawlable, sharable, and the only way
              the tail of a 382-product catalogue is reachable at all. */}
          {products.totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-12 flex items-center justify-between border-t border-border pt-6"
            >
              {products.hasPrevPage ? (
                <Link
                  className="text-sm underline underline-offset-4"
                  href={pageHref(parsed.page - 1)}
                >
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="numeric text-xs text-muted-foreground">
                Page {products.page} of {products.totalPages}
              </span>
              {products.hasNextPage ? (
                <Link
                  className="text-sm underline underline-offset-4"
                  href={pageHref(parsed.page + 1)}
                >
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
