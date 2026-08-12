import type { MetadataRoute } from 'next'

import { getServerSideURL } from '@/utilities/getURL'

/**
 * Lives at src/app/robots.ts — NOT inside the (app) route group. Next.js only
 * serves the robots file convention from the app root; the previous location
 * inside (app)/ meant /robots.txt was a 404 in production. Same rule applies
 * to sitemap.ts.
 *
 * AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) are
 * deliberately NOT blocked — owner decision 2026-07-30: being quoted by
 * answer engines is distribution, and the product/policy pages are
 * server-rendered precisely so machines can read them. Blocking training
 * crawlers is a per-shop values call; do it by adding explicit rules here.
 *
 * Googlebot and Googlebot-Image get their OWN explicit groups (2026-08-13),
 * identical in permissiveness to the `*` group they were already covered
 * by. Merchant Center's page-quality/policy checker ("Unable to do quality
 * & policy checks on product pages") flags a robots.txt that only names
 * `*` even though the wildcard technically already allows both — it wants
 * the two agents named outright before it will crawl product pages for
 * Shopping approval. Named groups are strictly additive here: nothing that
 * was allowed under `*` becomes disallowed for anyone else.
 */
const disallow = [
  '/admin',
  '/api/',
  '/next/',
  '/checkout',
  '/account',
  '/orders',
  '/login',
  '/logout',
  '/create-account',
  '/find-order',
  '/forgot-password',
  '/recover-password',
  // Internal search results: crawlable search pages are infinite
  // duplicate-content generators.
  '/search',
]

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getServerSideURL()

  return {
    host: baseUrl,
    rules: [
      { userAgent: '*', allow: '/', disallow },
      { userAgent: 'Googlebot', allow: '/', disallow },
      { userAgent: 'Googlebot-Image', allow: '/', disallow },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
