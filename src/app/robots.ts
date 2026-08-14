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
 * Googlebot, Googlebot-Image and Storebot-Google all get their OWN explicit
 * groups (2026-08-13/14), identical in permissiveness to the `*` group they
 * were already covered by. Merchant Center's page-quality/policy checker
 * ("Unable to do quality & policy checks on product pages") flags a
 * robots.txt that only names `*` even though the wildcard technically
 * already allows all three — it wants the agents named outright before it
 * will crawl product pages for Shopping approval.
 *
 * ⚠️ Storebot-Google is the one that actually matters and the one Google's
 * own error message does NOT mention — the error text only suggests
 * Googlebot/Googlebot-Image (generic web-search crawlers), but per Google's
 * own developer docs "crawling preferences addressed to the Storebot-Google
 * user agent affect all surfaces of Google Shopping." Adding Googlebot/
 * Googlebot-Image alone (2026-08-13) did not clear the error — it recurred
 * >24h later — because Storebot-Google was still only covered by the
 * wildcard, same as Googlebot originally was. Named groups are strictly
 * additive here: nothing that was allowed under `*` becomes disallowed for
 * anyone else.
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
      { userAgent: 'Storebot-Google', allow: '/', disallow },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
