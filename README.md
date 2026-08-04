# E-Commerce Template — Next.js + Payload CMS

A production-grade, self-hosted e-commerce template you actually own: storefront,
admin, checkout, email, analytics and a Google Shopping feed — one Next.js app on
your own Postgres, no hosted-commerce API in the critical path.

Built to be **re-deployed per shop**: identity, branding, payment keys, mailbox
and feed credentials all live in the admin's Settings pages. A new shop is
four environment variables, a database, and filling in forms.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, Turbopack) |
| CMS / commerce backend | Payload CMS 3 + `@payloadcms/plugin-ecommerce` |
| Database | Postgres |
| Payments | Stripe (hosted Checkout Sessions) |
| Styling | Tailwind 4 + shadcn/ui |
| Product feed | Google **Merchant API** (not the retired Content API) |
| Email | Your own mailbox via SMTP/IMAP — no email SaaS |
| Tests | Vitest (integration, against a real Postgres) + Playwright (e2e) |

---

## Feature tour

**Storefront**
- Statically generated home, category and product pages (ISR) — served from
  cache, purged automatically when content changes, ~4ms TTFB, survives a
  database outage. Search and sort live on a dynamic `/search` route.
- Category landing pages as real path routes (`/shop/espresso-machines`) with
  their own metadata, canonicals and pagination.
- Variant families as **sibling products** sharing an `item_group_id` (the
  Amazon model, and what Google's feed spec actually requires): colour/size
  chips navigate between full product pages; reviews pool across the family.
- Discounts: lower the price, set a compare-at — display and charge read the
  same column so they can never disagree. Badges, strike-throughs, savings
  rows and Google `salePrice` mapping all derive from one utility.
- Automatic "More to consider" recommendations (category-based with a ranked
  premium step-up), replaced by hand-curation when present.
- Theme system: paste a [coolors.co](https://coolors.co) palette URL in
  **Settings → Brand & Theme** and the whole shop re-themes with WCAG
  contrast enforced. Light/dark included.

**Checkout & payments**
- Stripe **hosted Checkout** (full-page redirect): Stripe collects address,
  phone and payment; the shop never touches card data and ships no Stripe.js.
- Idempotent fulfilment: webhooks and the return page converge on exactly one
  order per payment. A webhook-event ledger dedupes Stripe's retries.
- "Buy now" checks out the single item through an ephemeral cart without
  touching the customer's real cart. Purchased carts self-heal.
- No products or prices are created in Stripe — your Postgres is the catalog;
  Stripe holds payment intents, charges and refunds only.

**Orders & operations**
- Computed fulfilment status (needs shipment / shipped / completed /
  cancelled / refunded) — colored pills in the admin list, filterable queue.
- Paste a tracking number (USPS/UPS/FedEx/DHL/DPD), save — the customer gets
  a branded shipping email with a carrier deep link. Idempotent, like the
  order-confirmation email before it.
- Admin dashboard: 30-day revenue, order count, AOV, unfulfilled queue,
  daily-revenue chart, latest orders — plus a pinned "Store" nav with live
  badges (unfulfilled orders, unread mail).

**Email — your own mailbox, no SaaS**
- **Settings → Email**: SMTP + IMAP credentials (write-only fields, stored
  AES-256-GCM encrypted). Works with any app-password mailbox provider.
- Transactional emails (order confirmation with product thumbnails and the
  customer's delivery address, shipping notification, order-access links,
  password resets) — all branded from your Company settings.
- A **Mail view inside the admin**: read the shop mailbox over IMAP
  (server-side search, pagination), reply with proper threading and a
  configurable signature, with senders matched to their order history.
  Inbound HTML is sanitized *and* sandboxed.
- Order pages are guest-accessible via tokenized links in the emails — no
  account required, no order enumeration possible.

**SEO / GEO**
- DB-driven `sitemap.xml`, correct `robots.txt` (AI crawlers welcome by
  default — being quotable is distribution), canonicals, per-page OG tags.
- Product JSON-LD complete enough for merchant listings: images, prices,
  sale prices, ratings, GTIN/MPN/brand, returns and shipping policy blocks
  that quote the same numbers your policy pages print.
- Organization/WebSite/BreadcrumbList/FAQPage schema, `llms.txt`, and fully
  server-rendered content so answer engines see real facts.
- **Shopping feeds working out of the box**: a Google Shopping feed and a
  Facebook/Meta catalog feed, no API credentials required — see
  [Google Merchant Center & product feeds](#google-merchant-center--product-feeds).

**Analytics & consent**
- GA4 via a measurement ID pasted in **Settings → Analytics** — full
  e-commerce funnel (view_item → add_to_cart → begin_checkout → purchase,
  with server-built purchase payloads deduped per order).
- Cookie banner wired to **Google Consent Mode v2** (denied-by-default,
  upgraded on accept), toggleable per shop.

**Multi-shop identity**
- **Settings → Company** is the single source of truth: trading name, legal
  entity, logos (header, mark/favicon, OG image), address, contact,
  returns/shipping policy numbers. Policy pages are seeded once and reference
  these values with `{{company.*}}` placeholders — change the returns window
  in one field and every sentence quoting it updates.

---

## Quickstart

Requirements: Node ≥ 24 (see `.nvmrc`), pnpm, Postgres 14+.

```bash
# 1. Install
pnpm install --ignore-workspace

# 2. Environment — only four variables are required
cp .env.example .env
#    PAYLOAD_SECRET         openssl rand -base64 32
#    DATABASE_URL           your Postgres connection string
#    NEXT_PUBLIC_SERVER_URL http://localhost:3000 (the real domain in prod)
#    PREVIEW_SECRET         any random string

# 3. Database
createdb ecommerce   # or whatever DATABASE_URL points at

# 4. Seed it (see below), or start empty
gunzip -c seed/database.sql.gz | psql ecommerce

# 5. Run
pnpm dev
```

Open `http://localhost:3000/admin` — Payload will prompt you to **create the
first admin user**. The storefront is at `http://localhost:3000`.

---

## Seeding the database

`seed/database.sql.gz` is a complete demo dataset dumped from a working shop:

- **382 products** across **105 categories** (kitchen & home equipment), with
  prices, specs, key features, GTIN/MPN identifiers, variant families and
  ~50% of the catalogue on genuine compare-at discounts
- **4,000+ product reviews** with pooled family ratings
- Seeded **policy pages** (returns, shipping, FAQ, privacy, terms) written
  once with `{{company.*}}` placeholders
- A fictional shop identity ("Fenwick & Cole") in Company settings — replace
  it with yours in the admin
- **No** users, orders, carts, credentials or personal data of any kind —
  including no feed token: open Settings → Google Merchant Center and save
  once, and a fresh token is minted for your shop's feed URLs (Export tab)

Restore it into an **empty** database *before* the first boot:

```bash
gunzip -c seed/database.sql.gz | psql <your-database-name>
pnpm dev   # Payload reconciles the schema on boot
```

Two honest caveats:

1. **Product images are not included.** The demo catalogue's images are
   supplier photographs that can't be redistributed in a repository. Product
   cards and pages render clean placeholder tiles for missing images. Attach
   your own images in the admin, or import a real catalogue (next point).
2. **The demo catalogue is a stand-in.** For a real shop, use the CSV
   importer (`src/lib/import/`) which creates products, variant families,
   images from URLs and reviews per row — or delete the demo products and
   enter your own.

To start from a completely empty shop instead, skip the restore: boot, create
the admin user, and seed just the policy pages via
`POST /next/policies/seed` (admin-only endpoint).

---

## Per-shop configuration (all in the admin)

| Where | What |
|---|---|
| Settings → Company | Name, legal entity, logos, address, contact, returns/shipping numbers |
| Settings → Brand & Theme | Paste a coolors.co URL; contrast-enforced re-theme |
| Settings → Stripe | API keys (write-only, encrypted), webhook health, reconciliation, refunds |
| Settings → Email | SMTP/IMAP mailbox (encrypted), From/Reply-To, signature, test-send |
| Settings → Google Merchant Center | Feed export URLs + file downloads (Export tab), dry-run feed preview, markets, merchant ID, service-account JSON (encrypted) |
| Settings → Analytics | GA4 measurement ID, cookie-consent banner toggle |
| Settings → Homepage | Hero copy, featured product, section toggles |

Environment variables beyond the required four are **optional fallbacks** for
headless deploys — admin-stored values always win. See `.env.example`.

Webhooks: point a Stripe endpoint at `/api/payments/stripe/webhooks` (the
admin's Stripe page lists exactly which events to enable), or run
`pnpm stripe-webhooks` locally.

---

## Google Merchant Center & product feeds

The catalogue lives in your own Postgres, so the Shopping feed is generated
straight from it — no export plugin, no third-party feed service.

**Two feeds, one mapper.** Settings → Google Merchant Center → **Export**
shows both, each with a Copy-URL and a Download-file button:

| Feed | URL | Use in |
|---|---|---|
| Google Shopping (RSS 2.0 XML) | `/feed/google-shopping.xml?key=<token>` | Merchant Center → Data sources → Add product source → **Scheduled fetch** |
| Facebook / Meta catalog (CSV) | `/feed/facebook-catalog.csv?key=<token>` | Commerce Manager → Catalog → Data sources → **Scheduled feed**, or manual upload |

Both platforms poll the URL daily — **no Google or Meta API credentials are
needed to get listed**. The `key` token is minted automatically the first
time you save the Merchant Center settings; treat the URLs as secrets (the
token is the only access control). The downloads produce byte-identical
files, useful for validating in Merchant Center's diagnostics before your
domain is publicly reachable.

**What each offer carries:** price, availability, condition, brand,
GTIN/MPN (with `identifier_exists` handled when a product has neither),
the canonical product-page link, image, and `item_group_id` so colour/size
siblings group into one listing with their own prices and photos.

**Discounts map the way Google expects.** A product on sale sends
`price` = the compare-at (was) price and `sale_price` = the charged price —
the same two database columns the product page, cart and Stripe charge read,
so the feed and the page can never disagree (that mismatch is what gets
Merchant Center accounts suspended). A future `saleEndsAt` becomes
`sale_price_effective_date`. The feed routes are `no-store` for the same
reason: Google always fetches live prices, never a stale cache.

**Affiliate products never enter any feed.** Google bans affiliate links in
Shopping; a derived `feedEligible` flag (computed from the fulfilment mode
in a hook, never hand-set) filters them out structurally, on every path.

**Preview before you point Google at it.** The Merchant Center settings page
has a dry-run **Preview feed** action that builds the real payload locally
and reports exactly which products would be sent, which were withheld and
why, plus warnings (discounts outside Google's 5–90% sale-annotation band,
overdue sale windows). It sends nothing to Google.

**Upgrade path: Merchant API push.** The same mapper is already shaped for
Google's Merchant API (the replacement for the retired Content API — don't
follow tutorials using `content/v2.1`), and the settings page takes a
service-account JSON key (write-only, stored encrypted) for when you want
real-time price/stock sync on top of the daily fetch. The scheduled-fetch
feed is fully supported and sufficient to run Shopping ads and free
listings today.

---

## Development

```bash
pnpm dev              # storefront + admin with live reload
pnpm generate:types   # after changing any collection/global
pnpm test:int         # integration tests (real Postgres; uses <db>_test)
pnpm test:e2e         # Playwright
pnpm build && pnpm start   # production build (static generation happens here)
```

- Integration tests run against a **separate database** (`<db>_test`,
  auto-derived) so they can never touch shop data.
- Static generation is verified in `pnpm build` — the route table should show
  home, `/shop/**` and `/products/**` as prerendered.
- `CLAUDE.md` documents the architecture decisions and the sharp edges in
  depth — read it before changing money paths, feed logic or hooks.

## Production notes

- **Deploying on a Hostinger VPS?** `DEPLOY-HOSTINGER.md` is a complete
  walk-through: which plan, server setup, Postgres, Nginx/SSL, and a shop
  mailbox (SMTP+IMAP) with DNS handled.

- Set `NEXT_PUBLIC_SERVER_URL` to the real `https://` domain — canonicals,
  sitemap, OG URLs and email links derive from it.
- Configure SPF/DKIM for the sending domain or transactional email will land
  in spam.
- Media uploads store on local disk (`public/media`) — appropriate for a
  single server with a persistent disk; add an S3 storage adapter for
  serverless/multi-instance deploys.
- Legal pages ship with review notes: terms, privacy (CCPA-structured) and
  the affiliate-disclosure stance need a human lawyer's pass for your
  jurisdiction before launch.

## License

No license is currently granted. All rights reserved by the repository owner.
