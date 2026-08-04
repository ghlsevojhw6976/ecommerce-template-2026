import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

import { revalidatePath } from 'next/cache'

/**
 * Storefront revalidation — the other half of static generation.
 *
 * Home, category and product pages are prerendered (Shopify-style: cached
 * storefront, purged on content change). These hooks are the purge. Every
 * hook respects `context.disableRevalidate` (seeds, imports and tests pass it
 * so a 400-product import doesn't fire 400 revalidations), and every call is
 * wrapped so a revalidation failure can never fail the write that triggered
 * it — stale cache is recoverable, a lost edit is not.
 */

const safeRevalidate = (path: string, type?: 'layout' | 'page'): void => {
  try {
    revalidatePath(path, type)
  } catch {
    // Outside a Next request scope (vitest, payload run scripts) this throws;
    // there is no cache to purge there.
  }
}

/**
 * Invalidate EVERYTHING under the storefront layout. For data rendered on
 * every page: company identity (titles, header, footer), theme tokens, nav
 * categories. Cheap to call on rare admin edits; wrong to call on product
 * writes.
 */
export const revalidateEverything: GlobalAfterChangeHook = ({ doc, req: { context } }) => {
  if (!context.disableRevalidate) safeRevalidate('/', 'layout')
  return doc
}

export const revalidateProduct: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  req: { context },
}) => {
  if (context.disableRevalidate) return doc

  if (doc._status === 'published') {
    safeRevalidate(`/products/${doc.slug}`)
    // Listing surfaces that show this product's card. 'layout' on /shop
    // sweeps every category + pagination page in one call — precise per-
    // category invalidation isn't worth the bookkeeping.
    safeRevalidate('/shop', 'layout')
    safeRevalidate('/')
    safeRevalidate('/sitemap.xml')
  }

  // Unpublished or renamed: the old URL must stop serving the stale page.
  if (previousDoc?._status === 'published') {
    if (doc._status !== 'published' || previousDoc.slug !== doc.slug) {
      safeRevalidate(`/products/${previousDoc.slug}`)
      safeRevalidate('/shop', 'layout')
      safeRevalidate('/sitemap.xml')
    }
  }

  return doc
}

export const revalidateProductDelete: CollectionAfterDeleteHook = ({
  doc,
  req: { context },
}) => {
  if (!context.disableRevalidate) {
    safeRevalidate(`/products/${doc?.slug}`)
    safeRevalidate('/shop', 'layout')
    safeRevalidate('/sitemap.xml')
  }
  return doc
}

/**
 * Category edits change their landing page AND the nav/footer rendered on
 * every page — so this is a layout-wide purge, like company edits.
 */
export const revalidateCategory: CollectionAfterChangeHook = ({ doc, req: { context } }) => {
  if (!context.disableRevalidate) {
    safeRevalidate('/', 'layout')
    safeRevalidate('/sitemap.xml')
  }
  return doc
}

export const revalidateCategoryDelete: CollectionAfterDeleteHook = ({
  doc,
  req: { context },
}) => {
  if (!context.disableRevalidate) {
    safeRevalidate('/', 'layout')
    safeRevalidate('/sitemap.xml')
  }
  return doc
}

/**
 * For code OUTSIDE Payload hooks that changes what a static page shows —
 * today that is the raw-SQL inventory decrement at fulfilment, which fires
 * no afterChange.
 */
export const revalidateProductPaths = (slugs: (string | null | undefined)[]): void => {
  for (const slug of slugs) {
    if (slug) safeRevalidate(`/products/${slug}`)
  }
}
