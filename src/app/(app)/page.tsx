import configPromise from '@payload-config'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import React from 'react'

import type { Category, Company, Homepage as HomepageGlobal, Product } from '@/payload-types'
import { CategoryGrid } from '@/components/Home/CategoryGrid'
import { Hero } from '@/components/Home/Hero'
import { ProductRow } from '@/components/Home/ProductRow'
import { TrustRow } from '@/components/Home/TrustRow'
import { companyName, getCompany } from '@/utilities/getCompany'
import { getNavCategories, type NavCategory } from '@/utilities/getNavCategories'

/**
 * Homepage.
 *
 * Order follows what a first-time visitor needs, in sequence:
 *   what is this → what does it cost → why trust you → what else → where to browse
 *
 * The trust row sits directly under the hero rather than at the foot of the
 * page. At higher price points the blocker is risk, not price, and burying
 * "30-day returns, 2-year warranty" below every other section means the
 * visitor deciding whether the shop is legitimate never reaches it.
 *
 * Every section self-hides when it has no data, so a shop mid-setup never
 * renders empty scaffolding — and no section can leave a ragged grid.
 */

const isProduct = (value: unknown): value is Product =>
  Boolean(value && typeof value === 'object' && 'title' in (value as Product))

// Static homepage; purged on Homepage/Company/Brand/nav edits by the
// revalidation hooks, with an hourly fallback.
export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const [company, payload] = await Promise.all([
    getCompany(),
    getPayload({ config: configPromise }),
  ])
  const homepage = (await payload
    .findGlobal({ slug: 'homepage', depth: 0 })
    .catch(() => ({}))) as Partial<HomepageGlobal>

  const name = companyName(company)
  const description = homepage.subcopy || company.tagline || undefined

  const title = company.tagline ? `${name} — ${company.tagline}` : name

  return {
    description,
    alternates: { canonical: '/' },
    openGraph: {
      title,
      ...(description ? { description } : {}),
      siteName: name,
      url: '/',
    },
    title,
  }
}

export default async function HomePage() {
  const payload = await getPayload({ config: configPromise })

  const [company, navCategories, homepageRaw] = await Promise.all([
    getCompany(),
    getNavCategories(),
    // depth 2: depth 1 resolves the related products but leaves their gallery
    // media as bare IDs, which renders every featured card as a placeholder.
    payload.findGlobal({ slug: 'homepage', depth: 2 }).catch(() => ({})),
  ])

  const homepage = homepageRaw as Partial<HomepageGlobal>

  // Curated first, newest as the fallback. A shop that has curated nothing
  // still gets a populated homepage rather than empty sections.
  const curatedFeatured = (homepage.featuredProducts ?? []).filter(isProduct)
  const heroPick = isProduct(homepage.heroProduct) ? homepage.heroProduct : null

  const needsFallback = !heroPick || curatedFeatured.length < 3

  const fallback = needsFallback
    ? await payload.find({
        collection: 'products',
        depth: 2,
        draft: false,
        limit: 9,
        overrideAccess: false,
        sort: '-createdAt',
        where: { _status: { equals: 'published' } },
      })
    : null

  const fallbackProducts = (fallback?.docs ?? []) as Product[]

  const heroProduct = heroPick ?? fallbackProducts[0] ?? null

  // Never repeat the hero product in the row directly beneath it.
  const featured = (curatedFeatured.length >= 3 ? curatedFeatured : fallbackProducts).filter(
    (product) => product.id !== heroProduct?.id,
  )

  // Curated category order, falling back to menu order.
  const curatedCategories = (homepage.featuredCategories ?? []).filter(
    (c): c is Category => Boolean(c && typeof c === 'object'),
  )

  // Curated categories can be at ANY depth. `getNavCategories` returns only
  // roots, so looking them up in that array alone silently drops every leaf —
  // which is exactly what a useful homepage grid is made of. Flatten first.
  const flattenTree = (nodes: NavCategory[]): NavCategory[] =>
    nodes.flatMap((node) => [node, ...flattenTree(node.children)])

  const allCategories = flattenTree(navCategories)

  const categories: NavCategory[] = curatedCategories.length
    ? curatedCategories
        .map((category) => allCategories.find((nav) => String(nav.id) === String(category.id)))
        .filter((nav): nav is NavCategory => Boolean(nav))
    : navCategories

  return (
    <React.Fragment>
      <Hero company={company} homepage={homepage} product={heroProduct} />

      {homepage.showTrustRow !== false && <TrustRow />}

      {homepage.showFeatured !== false && (
        <ProductRow
          className="py-[var(--space-section)]"
          heading={homepage.featuredHeading?.trim() || 'Featured'}
          products={featured}
        />
      )}

      {homepage.showCategories !== false && (
        <div className="border-t border-border">
          <CategoryGrid categories={categories} />
        </div>
      )}
    </React.Fragment>
  )
}
