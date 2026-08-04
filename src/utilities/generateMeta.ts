import type { Metadata } from 'next'

import type { Page, Product } from '../payload-types'

import { companyName, getCompany } from './getCompany'
import { mergeOpenGraph } from './mergeOpenGraph'

/**
 * Metadata for a Payload doc (page or product).
 *
 * Fallback chain is the template contract: hand-written meta wins when an
 * editor wrote it, otherwise the doc's own content fills in — a future shop's
 * catalogue arrives with zero hand-written meta, and every page must still
 * emit a real title and description. No hardcoded shop name anywhere: the
 * root layout's title template appends it.
 *
 * URLs are RELATIVE and resolved against the layout's metadataBase — never
 * interpolate env vars here (the old version emitted literal "undefined/…"
 * image URLs when NEXT_PUBLIC_SERVER_URL was unset).
 */
export const generateMeta = async (args: { doc: Page | Product }): Promise<Metadata> => {
  const { doc } = args || {}

  const ogImage =
    typeof doc?.meta?.image === 'object' && doc.meta.image !== null && 'url' in doc.meta.image
      ? doc.meta.image.url
      : undefined

  const description =
    doc?.meta?.description ||
    ('shortDescription' in (doc ?? {})
      ? (doc as Product).shortDescription || undefined
      : undefined)

  const title = doc?.meta?.title || doc?.title || undefined
  const slug = Array.isArray(doc?.slug) ? doc?.slug.join('/') : doc?.slug
  const url = slug && slug !== 'home' ? `/${slug}` : '/'

  return {
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    openGraph: mergeOpenGraph({
      ...(description ? { description } : {}),
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      // Next replaces the layout's openGraph object wholesale when a page
      // defines its own, so siteName must ride along here or share cards
      // lose the shop name.
      siteName: companyName(await getCompany()),
      ...(title ? { title } : {}),
      url,
    }),
    ...(title ? { title } : {}),
  }
}
