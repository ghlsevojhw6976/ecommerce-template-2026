import type { MetadataRoute } from 'next'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getServerSideURL } from '@/utilities/getURL'

/**
 * DB-driven sitemap — fully automatic for whatever catalogue the next shop
 * ships with. Lives at src/app/sitemap.ts (app root, not the (app) route
 * group) for the same serving reason as robots.ts.
 *
 * Included: home, /shop, every category as its path route, every published
 * product, every page. lastModified comes from updatedAt so crawlers can
 * prioritise what actually changed (price edits bump updatedAt via the
 * publish flow).
 */
// Product/category hooks purge this on-demand; the hourly fallback exists for
// bulk writes that happen OUTSIDE the server process (imports, seeds), whose
// revalidation calls cannot reach the running server's cache.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getServerSideURL()
  const payload = await getPayload({ config: configPromise })

  const [products, categories, pages] = await Promise.all([
    payload.find({
      collection: 'products',
      depth: 0,
      draft: false,
      limit: 0,
      overrideAccess: false,
      pagination: false,
      select: { slug: true, updatedAt: true },
      where: { _status: { equals: 'published' } },
    }),
    payload.find({
      collection: 'categories',
      depth: 0,
      limit: 0,
      pagination: false,
      select: { slug: true, updatedAt: true },
    }),
    payload.find({
      collection: 'pages',
      depth: 0,
      draft: false,
      limit: 0,
      overrideAccess: false,
      pagination: false,
      select: { slug: true, updatedAt: true },
      where: { _status: { equals: 'published' } },
    }),
  ])

  const entry = (
    path: string,
    updatedAt?: string | null,
    priority?: number,
  ): MetadataRoute.Sitemap[number] => ({
    url: `${baseUrl}${path}`,
    ...(updatedAt ? { lastModified: new Date(updatedAt) } : {}),
    ...(priority !== undefined ? { priority } : {}),
  })

  return [
    entry('/', undefined, 1),
    entry('/shop', undefined, 0.9),
    ...categories.docs
      .filter((category) => category.slug)
      .map((category) => entry(`/shop/${category.slug}`, category.updatedAt, 0.7)),
    ...products.docs
      .filter((product) => product.slug)
      .map((product) => entry(`/products/${product.slug}`, product.updatedAt, 0.8)),
    ...pages.docs
      .filter((page) => page.slug && page.slug !== 'home')
      .map((page) => entry(`/${page.slug}`, page.updatedAt, 0.5)),
  ]
}
