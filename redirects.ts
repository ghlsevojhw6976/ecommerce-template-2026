import type { NextConfig } from 'next'

export const redirects: NextConfig['redirects'] = async () => {
  const internetExplorerRedirect = {
    destination: '/ie-incompatible.html',
    has: [
      {
        type: 'header' as const,
        key: 'user-agent',
        value: '(.*Trident.*)', // all ie browsers
      },
    ],
    permanent: false,
    source: '/:path((?!ie-incompatible.html$).*)', // all pages except the incompatibility page
  }

  // Categories moved from /shop?category=<slug> to path routes (2026-07-30).
  // Done here rather than only in the page so crawlers get a real 308 with a
  // Location header — the in-page redirect() streams as a 200 in dev.
  const legacyCategoryRedirect = {
    destination: '/shop/:category',
    has: [
      {
        type: 'query' as const,
        key: 'category',
        value: '(?<category>.*)',
      },
    ],
    permanent: true,
    source: '/shop',
  }

  return [internetExplorerRedirect, legacyCategoryRedirect]
}
