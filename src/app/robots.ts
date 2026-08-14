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
 * ⚠️ Storebot-Google is also worth naming explicitly — per Google's own
 * developer docs "crawling preferences addressed to the Storebot-Google
 * user agent affect all surfaces of Google Shopping." Google's own error
 * message and its own robots.txt help article (support.google.com/
 * merchants/answer/12467444) only ever mention Googlebot/Googlebot-Image,
 * so this is belt-and-braces, not the confirmed root cause.
 *
 * ⚠️⚠️ A second, real root cause (found 2026-08-14): every product image is
 * served from `/api/media/file/...` (Payload's media route), and the
 * blanket `Disallow: /api/` below was applied to EVERY group, including
 * Googlebot-Image and Storebot-Google — silently blocking every single
 * product image from Google's crawlers this entire time, independent of
 * which user-agents were named. `allowMedia` carves out that one path as a
 * more-specific Allow, which wins over the shorter `Disallow: /api/` per
 * robots.txt's longest-match-wins rule, while every other /api/ route
 * (GraphQL, the ecommerce plugin's REST endpoints, etc.) stays blocked.
 *
 * ⚠️⚠️⚠️ A THIRD root cause, and the one that finally explained a Merchant
 * Center re-check FAILING within minutes of the above being confirmed live
 * (2026-08-14): Next.js's `host` field on MetadataRoute.Robots emits a
 * `Host: <url>` line. That's the Yandex-only `Host` directive — never part
 * of the standard Google follows, and Google's own Search Console robots.txt
 * report flagged it explicitly: "Warning - Rule ignored by Googlebot ...
 * there [are] two robots.txt, one for http and another for https" — this
 * directive asserts a specific canonical protocol/host that Google's parser
 * doesn't support, and its presence was enough to make Google treat the
 * http/https robots.txt as inconsistent. REMOVED — costs nothing (Google
 * already ignored it for actual rule enforcement) and directly addresses
 * what Google's own tooling named as the problem.
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

// More specific than `Disallow: /api/` above, so it wins for this one path.
const allowMedia = ['/', '/api/media/']

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getServerSideURL()

  return {
    rules: [
      { userAgent: '*', allow: allowMedia, disallow },
      { userAgent: 'Googlebot', allow: allowMedia, disallow },
      { userAgent: 'Googlebot-Image', allow: allowMedia, disallow },
      { userAgent: 'Storebot-Google', allow: allowMedia, disallow },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
