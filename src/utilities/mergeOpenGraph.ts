import type { Metadata } from 'next'

/**
 * Neutral OG defaults. Shop identity (siteName, default og:image) comes from
 * the root layout's generateMetadata, which reads the Company global — this
 * helper must NEVER carry a name, description or image of its own. The
 * previous version shipped "Payload Website Template" and a payloadcms.com
 * image to every page that used it; that class of leak is exactly what the
 * Company-global rule exists to prevent.
 */
const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
}

export const mergeOpenGraph = (og?: Partial<Metadata['openGraph']>): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
  }
}
