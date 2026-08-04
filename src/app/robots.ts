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
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getServerSideURL()

  return {
    host: baseUrl,
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
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
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
