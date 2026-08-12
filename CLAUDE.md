# CLAUDE.md

Project context for Claude Code. This is a **living document** — append to it as
decisions get made. Keep it factual; it is read on every session.

---

## 1. What this project is

Custom e-commerce infrastructure built in-house, on Next.js, with **Google
Merchant Center** as a first-class distribution channel (Shopping ads / free
listings / Shopping feed).

The point is to **own the stack** rather than rent it from Shopify. That means we
own the product catalog, the order lifecycle, and the data model — because those
are exactly what the Merchant Center feed is generated from.

**Status:** scaffolded and running locally. Storefront + admin boot against
Postgres; the catalogue model and feed guard are in place. Merchant API sync not
yet built.

---

## 2. Stack

> Marked ❓ until confirmed. Update this table as things get locked in.

| Layer | Choice | Status |
|---|---|---|
| Framework | Next.js 16.2.6 (App Router, Turbopack) | locked |
| Runtime | Node 24 (see `.nvmrc` — template requires ≥24.15.0) | locked |
| Language | TypeScript 5.7 | locked |
| Package manager | pnpm | locked |
| Commerce backend / CMS | **Payload CMS 3.86.0 + `@payloadcms/plugin-ecommerce`** (MIT) | locked |
| Database | **Postgres** via `@payloadcms/db-postgres` | locked |
| Payments | Stripe (`stripeAdapter` in `src/plugins/index.ts`) | locked |
| Styling | Tailwind 4 + shadcn/ui | locked |
| Product feed | Google **Merchant API** (not Content API — see §4) | locked |
| Hosting | ❓ Vercel vs self-host | open |

**Version pinning matters here.** The template was taken from the `v3.86.0` tag,
not `main`. `main` is ahead of the published npm packages and uses APIs that
don't exist in the release (`type: 'slug'`, `generatePayloadViewport`). If you
re-pull the template, pin the tag to the installed Payload version.

---

## 3. Non-negotiable constraints

These are the things that should override convenience at every decision point.

1. **License must be permissive (MIT / Apache-2.0).**
   This is proprietary commercial infrastructure. **AGPL-3.0 dependencies are
   disqualifying** — AGPL's network clause is triggered by running a public web
   store and would obligate us to publish source. Check the license of any
   commerce engine before adopting it, not just the template wrapping it.

2. **We must own the product & order data.**
   The Merchant Center feed, inventory sync, and price updates are all generated
   from our own database. A template that treats a third-party SaaS as the
   system of record (Shopify, or a vendor's hosted API) defeats the purpose.

3. **No mandatory hosted-service API key** for core commerce functions. If the
   store cannot run against our own infrastructure alone, it is not our stack.

4. **Stripe is the payment processor, not the catalog.** Stripe holds payment
   intents, charges, refunds. Products/variants/inventory live in our DB.

---

## 4. ⚠️ Google Merchant Center — hard deadline

**The Content API for Shopping shuts down 18 August 2026.** Google has
deprecated it in favour of the **Merchant API** (a modular set of sub-APIs:
`products`, `inventories`, `accounts`, `reports`, `datasources`).

Consequences for us:
- **Build against the Merchant API from day one.** Do not follow any tutorial,
  blog post, or template that uses `content/v2.1` — it is dead code on arrival.
- Most sample code found online still targets Content API. Verify before copying.
- Auth is a Google Cloud **service account** with Merchant Center access;
  credentials never get committed (already covered in `.gitignore`).

Feed strategy to design later: primary product feed pushed via Merchant API,
plus supplemental real-time price/inventory updates so listings don't get
suspended for "mismatched value" policy violations.

**Feed delivery (2026-08-03): scheduled-fetch XML feed, live.**
`/feed/google-shopping.xml?key=<feedToken>` (token auto-minted in the
merchant-center global) renders RSS 2.0 from the SAME `mapProduct` output as
the API preview — one policy source, two formats. File-spec deltas are
pinned in `xmlFeed.int.spec.ts`: decimal prices not micros, singular
`g:gtin`, slash-interval sale window. Route is force-dynamic + no-store —
Google fetches daily and a cached stale price is the mismatched-value
suspension. Merchant Center setup: Data sources → Add product source →
Scheduled fetch → paste the URL. The Merchant API push (mapper is already
API-shaped) remains the upgrade for real-time price/stock sync.
⚠️ The XML feed surfaced that the mapper's `link` had ALWAYS been missing
`/products/` — every offer would have 404'd. Now pinned by test; the feed
`link` must be the canonical PDP URL.

### Variant families — sibling products, not plugin variants (2026-07-30)

Colour/size variants are SEPARATE products sharing an **`itemGroupId`**
(`sourcingFields.ts`, indexed, Google's 1–50 char alnum/underscore/dash rule in
its validate). The product page's `FamilySelector` renders colour/size chips
that **navigate** to the sibling's own page; reviews and ratings display
POOLED across the family (`getFamily` + weighted aggregate on the product
page; the Reviews section queries `product in familyIds`). Every product owns
its own price/GTIN/images/copy — which is what the Merchant feed requires (one
offer per variant, own link/image/`gtins`, shared `itemGroupId`; the mapper
emits all of these, and note `gtins` is an ARRAY — products_v1 has no singular
`gtin`). The importer creates one product per CSV row; rows in a group with
IDENTICAL options are duplicate supplier listings and only the cheapest
survives; identical reviews across siblings are seeded once per family.

The plugin's variants machinery (collections, checkout hooks) remains
configured but unused — removing it is a destructive schema change. Do not
build UI against `product.variants`; the storefront model is sibling products.

### Merchandising — automatic first, curation as override (2026-07-30)

`src/lib/commerce/recommendations.ts` powers "More to consider" on every
product page (same-leaf-category alternatives with parent-subtree fallback —
leaf-only fills 4 slots for 65% of products, the fallback lifts it to 97% —
ranked by rating, variant families deduped to one representative, and a
premium 1.1–2× "step up" option ranked into slot 2) and "You may also like" /
"Complete your setup" on the order page (curated accessories of purchased
items first, automatic fallback). A populated `relatedProducts` REPLACES the
automatic row — curation wins, but the default engine being automatic is what
makes rows render on future shops with zero curation. Labels are deliberate:
"More to consider", never "Customers also bought" — there is no behavioural
data and the label is a factual claim. Checkout stays merchandising-free
(Baymard: cross-sells near payment are an abandonment distraction, fatal at
this AOV).

⚠️ `defaultPopulate` on products strips relation-resolved product objects to
a few fields (no `_status`, no `title`, no `categories`). Never trust a
relation-resolved product for logic or rendering — collect ids and re-fetch
full docs (see `resolveCurated`/`getPostPurchase`). This has bitten three
separate times.

### Discounts — priceInUSD is ALWAYS the charged price (2026-07-30)

A sale = lower `priceInUSD` + set `compareAtPriceInUSD` (the was-price) above
it. **Nothing anywhere computes an "effective price."** Display and charge
read the same column, so they structurally cannot disagree. Do NOT attempt
sale-price hooks that rewrite the price at read time — they fail on four
verified grounds: the plugin's cart-subtotal hook selects only `priceInUSD`
(sale fields invisible to the charge path — pinned by a test in
`discountGuard.int.spec.ts`); the plugin's own mounted payment endpoint reads
the raw column; SQL sort/filter can't see computed values; afterRead rewrites
corrupt the admin round-trip.

Fields live in `src/collections/Products/discountFields.ts`. The
`normalizeDiscount` collection `beforeChange` hook (peer of the feed guard)
NULLS any compareAt not genuinely above the current price and auto-stamps
read-only `saleStartedAt` — the FTC / CA §17501 reference-pricing provenance
(the was-price must be genuine and recent; 90-day rule). `saleEndsAt` is
optional display+feed metadata; **the price does not revert itself** — an
overdue sale shows up as a feed-preview warning.

One shared util, `src/lib/commerce/discount.ts` (`getDiscount`,
`totalSavingsCents`, `gmcAnnotationWarnings`), feeds every surface: card badge
(`DiscountBadge`, accent pill, "8% off" percent framing — owner's choice),
struck was-price via `Price`'s `compareAtAmount` prop, PDP savings line,
cart/checkout per-line strikes + "Total savings" row, JSON-LD (`ListPrice`
priceSpecification; Offer.price stays the CHARGED price), and the Merchant
mapper. Variant-line prices in cart/checkout never claim the parent's saving.

**GMC mapping** (`mapProduct.ts`): on sale, Google's `price` = compareAt and
`salePrice` = priceInUSD — Google matches the page strikethrough against
`price` and the transacted amount against `salePrice`; keeping both in the
feed for the whole window makes boundary sync-lag harmless.
`salePriceEffectiveDate` (RFC3339, `endTime` EXCLUSIVE) is emitted only for a
future `saleEndsAt`. Feed preview warns on discounts outside Google's 5–90%
annotation band (>5% required — hence seeded discounts start at 6%), stale
`saleEndsAt`, and sales older than 90 days.

⚠️ The cart drawer/checkout get products through the ecommerce provider's
`cartsFetchQuery` populate spec (`src/providers/index.tsx`), which OVERRIDES
`defaultPopulate` — any new product field a cart surface needs must be added
THERE or it silently arrives undefined (this is how the drawer initially
showed no strikes while the DB was right).

Catalogue state: ~50% of published non-affiliate products seeded at 6–10% off
(one-off script, 2026-07-30). Affiliate products are never discounted — their
price belongs to the partner.

### SEO / GEO — automatic, Company-global-driven (2026-07-30)

Everything SEO-adjacent derives from the Company global or the DB — never env
vars, never constants. A full audit (28-agent, all findings live-verified)
found the discovery layer broken while the content layer was strong; both are
now correct, and automatic for the next catalogue.

- **`src/app/robots.ts` and `src/app/sitemap.ts` live at the APP ROOT**, not
  the `(app)` route group — Next only serves these file conventions from the
  root; inside the group they 404 (this is how robots.txt was dead). Sitemap
  is DB-driven (~495 URLs: products/categories/pages, lastmod = updatedAt).
  AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) are
  deliberately ALLOWED — owner decision: answer-engine citations are
  distribution.
- **Categories are PATH routes** — `/shop/[category-slug]` via the optional
  catch-all `src/app/(app)/shop/[[...category]]/page.tsx` (owner decision:
  rankable landing pages). Real `?page=` pagination (the old 48-cap left 334
  products uncrawlable), per-category metadata, page-1 canonical to the bare
  URL, `?q=` results noindexed. Legacy `?category=` 308s via `redirects.ts`.
- **Root layout `generateMetadata`** (`src/app/(app)/layout.tsx`) sets
  metadataBase (getServerSideURL), title template `%s | <Company name>`,
  favicon from `Company.logoMark`, and emits Organization + WebSite JSON-LD.
  ⚠️ A page defining its own `openGraph` REPLACES the layout's wholesale —
  `og:site_name` must ride along in every page-level OG block (all current
  producers do; copy the pattern).
- **Fallback chain is the template contract**: meta.title/description win
  when written, otherwise title + `shortDescription` fill in — future
  catalogues arrive with zero hand-written meta and must still emit real
  tags. `mergeOpenGraph`/`generateMeta` carry NO hardcoded identity; the
  admin SEO "generate" button reads the Company global.
- **PDP JSON-LD** (`products/[slug]/page.tsx`): image array (required for
  merchant-listing rich results), solo-product aggregateRating fallback
  (pooled only exists for families — gating on it dropped stars for 344/382),
  brand/gtin/mpn/sku/itemCondition, offers.url, priceValidUntil from
  saleEndsAt, MerchantReturnPolicy + OfferShippingDetails from Company
  policy fields (same numbers the policy pages print), BreadcrumbList +
  visible trail from one shared array.
- **Always serialize JSON-LD with `jsonLdScript`** (`src/utilities/jsonLd.ts`)
  — plain JSON.stringify breaks the page on a "</script>" in imported titles.
  `compactJsonLd` drops empty values so a fresh shop emits minimal-but-valid
  blocks.
- Utility pages (checkout/account/auth/orders/find-order) are noindexed.
  FAQPage JSON-LD generates from the FAQ page's own lexical content with
  placeholder resolution (`src/utilities/faqJsonLd.ts`). `/llms.txt` renders
  from Company + catalogue (honest note: speculative adoption, cheap
  insurance). The stock demo seed route (`next/seed`) is DELETED — it could
  restore "Payload Ecommerce Template" branding with one click.
- **Affiliate PDPs**: buy box renders an outbound `affiliateUrl` anchor with
  `rel="sponsored nofollow noopener"` instead of cart buttons; pages are
  INDEXED. ⚠️ Owner decision 2026-07-30: NO visible affiliate disclosure —
  FTC §255 / EU consumer law normally require one; flagged for the
  pre-launch legal review. rel="sponsored" is Google-mandatory regardless.

### Analytics — GA4, admin-managed, funnel-complete (2026-08-03)

`Settings → Analytics` holds the GA4 measurement ID (public by definition,
stored in clear; empty = no script loaded at all). The gtag loader renders in
the ROOT LAYOUT and is baked into static pages — the global's afterChange
hook purges the whole cache so a pasted ID takes effect immediately. GA4's
enhanced measurement covers SPA page_views; no per-route code.

E-commerce events all flow through `src/lib/analytics/` — `items.ts`
(server-safe builders; **cents→decimal conversion lives ONLY there**, pinned
by `analytics.int.spec.ts`; **item_id = product slug = Merchant feed
offerId**, so GA4/Ads/Shopping join on one key) and `gtag.ts` (client
senders, silent no-ops when GA is off). Fired: view_item (PDP island,
server-built payload), add_to_cart (only after the verified cart-state
signal — attempts don't count), remove_from_cart (delete + qty minus),
view_cart (drawer open), begin_checkout (drawer, review page, Buy now),
purchase (confirmation page; payload built server-side by
`orderToGaPurchase` and returned by `/next/checkout/confirm`; deduped
cross-session via localStorage keyed on order id — GA only dedupes
transaction_ids within a session).

**Cookie consent = Google Consent Mode v2** (2026-08-03). The
`cookieBannerEnabled` toggle (default ON) wires the four v2 signals
(`ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`):
the layout's inline script declares them DENIED **before** `gtag('config')`
— order inside one inline script is the only ordering guarantee — then
replays a stored choice from the `cookie_consent` first-party cookie
(180-day Max-Age). The bottom banner (`CookieBanner.tsx`) renders only
while no choice is stored; Accept/Decline both persist and
`gtag('consent','update', …)`. Decline exists on purpose: accept-only
banners are invalid consent under EU enforcement, and Consent Mode keeps
sending Google cookieless pings on denial anyway. Toggle OFF = no consent
signals at all (implied-consent markets); banner never renders while the
measurement ID is empty.

⚠️ Pre-launch: GA counts as an advertising pixel for the CCPA
"sell/share" analysis already flagged in the privacy review — configure GA4
without ads personalisation or add the "Do Not Sell or Share" link per
counsel. EU targeting still needs its own review (this banner is the
mechanism, not the legal sign-off).

### Email — own mailbox (SMTP+IMAP), no external API (2026-08-03)

`Settings → Email` holds the shop mailbox: SMTP for sending, IMAP for the
admin inbox. Passwords are write-only + AES-256-GCM (the Stripe credentials
pattern exactly — `src/lib/email/keys.ts` mirrors `stripe/keys.ts`:
admin > env (`SMTP_*`) > none, globalThis cache + TTL, refreshed by the
global's afterChange). The payload email adapter
(`src/lib/email/adapter.ts`) resolves credentials PER SEND, so auth emails
(password reset, order access) ride the same admin-managed transport.
A "Send test email to me" panel proves credentials before anything depends
on them. Works with any app-password provider (Zoho/Fastmail/Workspace);
**SPF/DKIM on the sending domain is a launch-checklist item** or mail lands
in spam.

**Admin "Store" nav** (2026-08-03): `beforeNavLinks` renders
`src/components/AdminNav/OpsNav.tsx` — Dashboard/Orders/Mail pinned above
the generic collection nav with live badges (unfulfilled orders = SQL
count; unread mail = IMAP STATUS, cheap) from `/next/mail?action=badges`,
fetched client-side on mount + every 2 min so a slow mailbox can never
block the admin shell. ⚠️ If `generate:importmap` claims "no new imports"
after a component was REMOVED from the config, delete
`src/app/(payload)/admin/importMap.js` and regenerate — a stale entry for
a deleted file 500s every admin page.

**Admin dashboard** (2026-08-03): `beforeDashboard` renders
`src/components/Dashboard/CommerceDashboard.tsx` — 30-day revenue/orders/
AOV cards, needs-shipment card linking to the filtered orders list, a
dependency-free SVG daily-revenue chart (one raw SQL aggregate; Number()-
coerce numerics), latest orders with status pills. Replaced the stock
template welcome block (its SeedButton pointed at the deleted demo-seed
route). Visitor counts are deliberately absent — they live in GA4 and need
the Analytics Data API + service account (env-only, Google-keys rule);
never fake them.

**Order management** (2026-08-03): orders carry a DERIVED
`fulfilmentStatus` (`needs_shipment`/`shipped`/`completed`/`cancelled`/
`refunded`) — the feedEligible pattern: computed in a field beforeChange
hook from payment status + trackingNumber, stored (SQL-filterable), never
hand-set. ⚠️ The hook MUST fall back to `originalDoc` for fields absent
from a partial update, or the email-stamp PATCH silently resets it. The
orders list renders colored pills (`src/components/Orders/StatusPill.tsx`,
a shared Cell component on both status columns; amber needs-shipment is
the operator's scan-for color) with defaultColumns ordered
action-first. Carriers: USPS/UPS/FedEx/DHL/DPD (DPD via the DELIStrack
deep-link pattern — DPD's site blocks bot fetches, verified against
documented patterns).

**Transactional emails** hook the orders collection (`src/lib/email/
orderEmails.ts`) so every order path converges: confirmation on create,
shipped email when `trackingNumber` is set or changed (fields on the orders
override; carrier select → tracking deep link via `carriers.ts`;
`shippedAt` auto-stamps). Idempotent via `confirmationEmailSentAt`/
`trackingEmailSentAt` — and deliberately NOT stamped when email is
unconfigured or the send fails, so the next save retries what was missed.
Send failures log and never fail the order write. Templates
(`templates.ts`) are pure functions — table-based inline-style HTML,
Company-global branded, HTML-escaped (titles are CSV imports), pinned by
`emailTemplates.int.spec.ts`.

**Admin Mail view** (`/admin/mail`, sidebar link): live IMAP reads via
imapflow — deliberately NO Postgres mirror at this volume (~20–30/day); the
mailbox stays the source of truth. Message HTML is sanitize-html'd
server-side AND rendered in a sandboxed iframe (two layers between inbound
mail and the authenticated admin session). Sender addresses are matched to
orders (`customerEmail`) and linked. Replies send through the shared
transport with In-Reply-To/References threading, and EVERY outbound email
is best-effort APPENDed to the IMAP Sent folder so the mailbox shows full
customer history in any client. **Search is server-side IMAP SEARCH**
(from/subject/body, whole mailbox) and listing is paginated 25/page
(sequence-range fetch — the pre-pagination view could only ever see the
newest 50 of what turned out to be a 373-message inbox). A `signature`
field in Settings → Email is appended to Mail-view replies only
(`composeReply`, RFC "-- " separator, test-pinned); settings edits reach
senders within the keystore's 30s TTL.

⚠️ Substantial payload.config changes (new adapter/global/admin view) can
wedge the dev server's HMR — all routes hang at 0% CPU with Postgres idle.
Restart `pnpm dev`; the schema push applies on boot. Custom admin
components also need `pnpm generate:importmap`. Related (2026-08-03): the
(payload) REST bundle can keep executing STALE chunks after lib edits —
hooks visibly running old code while a `payload run` script runs the new
code; `touch` does not cure it, only a dev-server restart does. If hook
behaviour contradicts the source, restart before debugging the source.

⚠️ One-off scripts: `pnpm payload run <file>` can silently execute NOTHING
(no output, exit 0) — observed twice; if a script prints nothing, run it
with `pnpm exec tsx --env-file=.env <file>` instead (same aliases, same
env, reliable output) and call `process.exit(0)` at the end.

⚠️ **Nested Payload operations inside hooks MUST pass `req`** to join the
operation's transaction — both found the hard way on the order-emails hook:
(1) an update without `req` opens a second transaction that blocks on the
row the outer uncommitted transaction holds = a silent self-deadlock that
hangs the save for exactly ImapFlow/pg timeout eternity; (2) a findByID
without `req` during CREATE gets NotFound — the row isn't committed yet.
Mail-server calls get explicit short timeouts (imapflow's socketTimeout
DEFAULT IS 5 MINUTES). Known trade-off: emails send inside the hook, so a
commit that fails after send has already emailed the customer — rare, and
preferred over emails that claim success before the send.

Live-verified 2026-08-03 against a real mailbox: SMTP send, IMAP inbox
list/read, Sent filing, confirmation email on order create, tracking email
on trackingNumber save, admin Mail view with order matching.

### Static generation — Shopify-style cached storefront (2026-07-30)

Home, `/shop`, every category page and every PDP are **prerendered** (build:
497 HTML pages; verified route table `○/●`, ~4ms TTFB) and purged on content
change; checkout/account/auth/search stay dynamic (`force-dynamic` — they are
session/query-driven and noindexed). Verified end-to-end on a prod build:
publish through the running server → page re-renders fresh on next request.

- **Purge lives in `src/hooks/revalidateStorefront.ts`.** Products afterChange
  → own PDP + `/shop` layout-sweep + home + sitemap (old slug too on
  rename/unpublish). Categories and the Company/Homepage/Brand/Header/Footer
  globals → `revalidatePath('/', 'layout')` (they render on EVERY page).
  All hooks respect `context.disableRevalidate` and never throw — a stale
  cache is recoverable, a lost write is not. Time-based `revalidate = 3600`
  on home/shop/PDP backstops cross-product effects (recommendation rows).
- **Static routes cannot see query strings.** This is why pagination is in
  the PATH (`/shop/<cat>/page/2`) and why sort/search live on the dynamic
  `/search` route (noindexed, robots-disallowed) — a `?sort=` on a static
  page would silently do nothing. `SortSelect` navigates to `/search`.
- **Raw-SQL writes bypass hooks**: the fulfilment inventory decrement calls
  `revalidateProductPaths` itself (`src/lib/stripe/inventory.ts`). Any future
  `payload.db.pool` write that changes a rendered value must do the same.
- **`revalidatePath` only works in-process.** A `payload run` script's hook
  fires into the void (guarded, no error) — the running server keeps serving
  the old page until its time-based fallback. Bulk scripts (imports, seeds)
  should be followed by a rebuild or an admin-triggered touch.
- ⚠️ **Build concurrency vs Postgres**: static export fans out to workers,
  each with its own pool — pool `max: 5` (payload.config) × `experimental.
  cpus: 6` (next.config) stays under Postgres's 100-connection default. At
  the pg defaults a 16-core build dies on error 53300.
- ⚠️ Client components using `useSearchParams` inside a prerendered page
  need a `<Suspense>` boundary or the BUILD fails (only surfaces in `pnpm
  build`, never dev). Run a production build before shipping route changes:
  `NEXT_DIST_DIR=.next-build pnpm build`.

### 4a. Affiliate products must NEVER enter the feed

Google policy: *"You're not allowed to use Shopping to promote affiliate or
pay-per-click links to products, except when participating as a Comparison
Shopping Service (CSS)."* Products in the feed must be purchasable **on our own
domain**.

Feeding an affiliate product risks the **mismatched checkout URL domains**
disapproval and, worse, account-level **misrepresentation** enforcement — which
would take our direct products down too. Never worth it.

Full reasoning: `docs/decisions/2026-07-27-affiliate-products-merchant-center.md`

---

## 4b. Catalogue model — three fulfilment modes

| Mode | Checkout | Fulfilment | In feed |
|---|---|---|---|
| `direct` | our domain, Stripe | our stock | ✅ |
| `dropship` | our domain, Stripe | supplier ships | ✅ |
| `affiliate` | **external domain** | partner | ❌ never |

`feedEligible` is **derived** (`fulfilment !== 'affiliate'`) in a Payload
`beforeChange` hook — never a manually-set field. The feed builder filters on it.
This is the single guard preventing an accidental account suspension.

`dropship` is the growth lever: converting an affiliate product into one we sell
as merchant of record makes it advertisable, and reseller margin usually beats
affiliate commission.

---

## 4c. Running locally

```bash
nvm use                 # picks up .nvmrc -> Node 24
pnpm install --ignore-workspace
cp .env.example .env    # then fill in; PAYLOAD_SECRET: openssl rand -base64 32
pnpm dev                # storefront + admin on http://localhost:3000/admin
```

Postgres runs locally via Homebrew (`postgresql@14`, trust auth as the local
user). Database: `ecommerce_infrastructure`. Payload pushes schema changes
automatically in dev — no migration step while iterating.

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server, storefront + admin |
| `pnpm generate:types` | Regenerate `src/payload-types.ts` — **run after any collection change** |
| `pnpm test:int` | Vitest integration tests (hits the real DB) |
| `pnpm test:e2e` | Playwright |
| `pnpm stripe-webhooks` | Forward Stripe webhooks to localhost |

**Key files**

| Path | Purpose |
|---|---|
| `src/payload.config.ts` | Collections, DB adapter, editor |
| `src/plugins/index.ts` | Ecommerce plugin, Stripe adapter, orders override |
| `src/collections/Products/sourcingFields.ts` | Fulfilment mode + GMC attributes + feed guard |
| `src/collections/Suppliers/index.ts` | Dropship suppliers |
| `src/globals/MerchantCenter.ts` | Admin → Settings → Google Merchant Center |
| `src/globals/StripeSettings.ts` | Admin → Settings → Stripe |
| `src/lib/merchant/` | Merchant API v1 mapper + dry-run feed builder |
| `src/lib/stripe/` | Health, reconciliation, refunds, repair |
| `tests/int/feedEligibility.int.spec.ts` | Guards the feed rule — do not delete |
| `tests/int/merchantMapper.int.spec.ts` | Pins the cents→micros conversion |
| `tests/int/stripeAdmin.int.spec.ts` | Pins the refund guards |

**Admin surfaces**

`Settings → Google Merchant Center` — connection, markets, and a **Preview
feed** action that builds the real Merchant API payload locally and reports
what would be sent and why products were withheld. Sends nothing to Google.

`Settings → Company` — **the single source of truth for who the shop is.**
Three names, three jobs (2026-08-03): `name` = the BRAND (titles, emails,
schema, header fallback text), `legalName` = the registered entity (terms,
footer legal line), `brandWordmark` = optional header-only text next to the
logo mark (falls back to `name`). The header renders logoMark + wordmark
when no horizontal logoLight exists; mark size follows `logoHeight`.
Name, legal entity, logo (light/dark), address, phone, registration numbers and
policy defaults (returns window, warranty, free-shipping threshold). The header,
footer, contact and policy pages all read from here.

Policy pages reference these with `{{company.*}}` placeholders, resolved at
render by `CompanyRichText`. This is what lets returns/terms/privacy be written
once and seeded into every shop — change the returns window in one place and
every sentence mentioning it updates. **Unknown or empty placeholders are left
visible** rather than blanked: a page with a conspicuous gap gets fixed, one
reading "Call us on ." does not.

### Returns address

`Settings → Company → Returns address`. Structured fields, not free text, so
the address can be reused in RMA emails and labels later.

Shipping from Europe into the US normally means a **domestic US returns
address** — an international return costs enough to stop the purchase happening
at all, and 15% of shoppers abandon over an unsatisfactory returns policy.

`returnsAddressLines()` refuses a half-filled block (needs at least street +
city) and falls back to the trading address instead — a partial address is
worse than a fallback, because the parcel goes nowhere.

⚠️ Removing a field is a **destructive** schema change. Payload prompts for
confirmation, which silently hangs any non-interactive script (a seed, or
vitest). Symptom: the script stalls, or a whole test suite times out with
unrelated failures.

Fix: drop the stale column manually, then boot `pnpm dev` once to apply the
additive half — **and do it on BOTH databases**, dev and `_test`. Forgetting
the test database produces a batch of confusing failures in suites that have
nothing to do with the change.

### Cross-border shipping disclaimer

`Settings → Company → Shipping & Customs`. One switch
(`shippingDisclaimerEnabled`) controls it on the product page, the shipping
policy, the FAQ and the terms. When off, the component renders nothing and
`{{company.shippingDisclaimer}}` resolves to an empty string rather than
leaving braces in CMS copy — see `ALWAYS_RESOLVE` in `companyPlaceholders.ts`,
which is the one exception to "unresolved placeholders stay visible".

The generated sentence quotes the **door-to-door** window (processing +
transit), not transit alone.

Policy pages state delivery times through `{{company.deliveryTimes}}` — the
full cross-border statement when the toggle is ON, the domestic tiers when it
is OFF, never empty (a delivery question must never render answerless; the
`{{company.shippingDisclaimer}}` placeholder alone left the FAQ blank when
disabled). After changing policy SOURCE copy, re-seed just those pages:
`seedPolicies({ payload, overwrite: true, only: ['shipping', 'faq'] })` — the
`only` filter exists so hand-edited pages are never clobbered. Customers read "7–14 days" as time until arrival,
and the gap between those readings is where complaints start.

⚠️ **US de minimis is suspended.** Since 29 Aug 2025 the $800 duty-free
threshold no longer applies to any origin, and Section 321 is repealed outright
from 1 Jul 2027. Every shipment into the US now attracts duty regardless of
value. `customsHandling` must be set deliberately: DDP (we pay, quoted at
checkout) or DDU (customer pays on delivery). DDU on a $749 order means a
surprise customs bill at the door — the top cause of refused deliveries and
chargebacks on cross-border sales.

**Per-shop launch assets** — what visuals and copy a new deploy needs, with
exact aspect ratios and the counts each layout expects:
`LAUNCH-ASSETS.md`. Keep it in step with the components; the dimensions in it
are read from the code, not estimated.

**Policy pages** (`returns`, `shipping`, `faq`, `privacy`, `terms`) are seeded
from `src/endpoints/seed/policies/` with real copy, written once and reused
across shops. Install into a new shop via `POST /next/policies/seed`
(admin-only). Existing pages are **skipped unless `overwrite` is passed**, so
re-running never destroys edited copy.

⚠️ **Terms and Privacy need legal review before launch.** Both carry review
notes in their source. Privacy is structured to CCPA/CPRA including the
requirements effective 1 Jan 2026 (per-category retention, service-provider
disclosures). Two decisions need a human: whether the shop "sells"/"shares"
personal information as CCPA defines it (advertising pixels usually count, and
if so a "Do Not Sell or Share" link is required), and the arbitration/venue
terms.

⚠️ Never reintroduce env-var branding (`COMPANY_NAME`, `SITE_NAME`). That is how
a template ships with the previous client's details in the footer.

`Settings → Brand & Theme` — paste a coolors.co palette URL; the whole shop
re-themes with contrast enforced. See §4e.

**Token rules the palette system depends on** (each violated once by the stock
template and found by a full-site contrast audit, 2026-07-30):
1. A hover background always brings its PAIRED foreground
   (`hover:bg-secondary hover:text-secondary-foreground`) — a lone
   `hover:bg-*` inherits whatever text colour is standing there.
2. Quiet text is `text-muted-foreground`, never alpha-faded primary
   (`text-primary/50`) — under a mid-lightness palette primary that measures
   ~1.6:1 on the page background.
3. `*-foreground` tokens are TEXT colours, never surfaces
   (`bg-primary-foreground` as a card = foreground-on-foreground under any
   palette whose primary is light).
4. Links are underlined foreground, not colour-only — and put classes on the
   `Button`, not its `asChild` child: Radix Slot concatenates classes without
   tailwind-merge, so conflicts resolve by stylesheet order, i.e. randomly.
Audit method: in-page walker measuring rendered contrast of every text node
against its composited background, all key routes, both themes (WCAG 4.5:1 /
3:1 large). Re-run it after any palette or component-variant change.

`Settings → Stripe` — live/test mode, key and webhook health, "last event
received" (the tell for a silently dead webhook), and reconciliation of local
transactions against Stripe with a per-row repair action. Individual
transactions carry a two-step **Refund** panel.

⚠️ **Integration tests run against a SEPARATE database** — `vitest.setup.ts`
appends `_test` to `DATABASE_URL` (override with `TEST_DATABASE_URL`). Do not
remove this: the tests create real products and reviews, and anything they fail
to clean up becomes a permanent fixture of the shop. 69 test products had
already leaked into the storefront grid before this was fixed.

⚠️ Tests share one database and Payload pushes schema on init, so
`fileParallelism` is **off** in `vitest.config.mts`. Turning it back on
produces spurious "constraint does not exist" failures.

**Stripe credentials are managed from the admin** (owner decision 2026-07-30,
superseding the earlier env-only rule). `Settings → Stripe → API keys`:

- Secret key and webhook secret are **write-only** — paste to set/replace, the
  field reads back empty. Stored **encrypted** (AES-256-GCM keyed from
  `PAYLOAD_SECRET`, `src/lib/crypto/secretBox.ts`); the API never returns the
  ciphertext fields (`access.read: false`). The publishable key is stored in
  clear because it is public by definition.
- Resolution order is **admin > env > none** (`src/lib/stripe/keys.ts`); the
  bare `sk_test_`/`pk_test_`/`whsec_` prefixes from `.env.example` count as
  absent. The connection panel shows which source is live.
- Keys are resolved **per request** via `dynamicStripeAdapter`
  (`src/lib/stripe/dynamicAdapter.ts`) — the plugin's `stripeAdapter()` freezes
  keys at call time, so the factory is re-invoked inside each handler. A key
  pasted in the admin works without a restart.
- The keystore cache lives on `globalThis` (Next duplicates module state per
  bundle) with a 30s TTL for multi-instance deploys; server code awaits
  `ensureStripeCredentialsLoaded(payload)` before reading.
- A database dump alone therefore reveals ciphertext only; rotating
  `PAYLOAD_SECRET` invalidates stored keys (re-paste them after a rotation).

**Google credentials moved to the admin (2026-08-03, owner decision
superseding env-only).** `Settings → Google Merchant Center → Service
account`: paste the JSON key into a write-only field, sealed AES-256-GCM
(`src/lib/merchant/keys.ts`, third instance of the credentials pattern;
admin > env > none, env = GOOGLE_SERVICE_ACCOUNT_KEY_B64 /
GOOGLE_APPLICATION_CREDENTIALS for headless deploys). Merchant ID, markets
and dry-run were already settings fields — their env twins are retired.

⚠️ **Global afterChange keystore refetches MUST pass `req`** — without it
the refetch reads OUTSIDE the uncommitted transaction and caches the
PREVIOUS state, leaving every keystore one save behind (caught by
`merchantCredentials.int.spec.ts`; Email had the same latent bug, Stripe
always did it right).

---

## 4d. How Stripe is used — no product catalogue in Stripe

**We do not create Products or Prices in Stripe, and we don't need to.**

Verified in the adapter source: it calls `stripe.paymentIntents.create({ amount,
currency, customer, metadata })`. There is no `products.create`, no
`prices.create`, no `price_data`, no `line_items` anywhere in it. The amount is
computed by Payload from our Postgres catalogue and sent as a single integer.

So the split is:

| | Owns |
|---|---|
| **Postgres / Payload** | products, variants, prices, inventory, carts, orders |
| **Stripe** | payment intents, charges, refunds, customers |

Line-item detail rides along in PaymentIntent `metadata` (`cartID`,
`cartItemsSnapshot`, `shippingAddress`) — visible in the Stripe dashboard, but
not modelled as Stripe objects.

This is what makes the Merchant Center feed possible: the catalogue is ours to
query.

### Checkout = hosted Stripe Checkout Sessions (2026-07-30)

The storefront checkout goes **straight to checkout.stripe.com** (hosted
Checkout Session, no `ui_mode`) from both entry points — the cart drawer
("Checkout with Stripe") and the PDP ("Buy now with Stripe"); the labels ARE
the Baymard-required signposting. `/checkout` remains as the slim review page:
it is the `cancel_url` landing (Stripe's back button) and the direct-nav
fallback, not a mandatory stop. All entry points share ONE client hook,
`useStripeCheckout` (`src/components/checkout/useStripeCheckout.ts`), which
also adopts a revived cart identity when the server replaces a purchased cart
(see below). Stripe collects email, US shipping address (with autocomplete),
**phone** and payment; we maintain no address or card UI and load no Stripe.js
at all. Verified end-to-end 2026-07-30 with a live test purchase (order #102).

**Buy now = THIS item only.** The PDP's "Buy now with Stripe" checks out a
single item through an ephemeral server-side cart
(`src/lib/commerce/buyNowCart.ts`) — the customer's real cart is never read or
spent (Amazon semantics). The ephemeral cart deliberately has NO customer so
the provider's user-join can never adopt it; attribution rides on the
transaction/order. Stripe's back button returns to the product page for
buy-now, the review page for cart checkouts. The confirm response carries the
spent `cartID` and the client clears its local cart ONLY on a match — a
buy-now purchase must not wipe the cart. The `/checkout` review page has full
quantity/remove controls (same components as the drawer).

**Purchased carts self-heal at checkout.** A cart already marked `purchasedAt`
(paid in another tab/device, or the customer never returned to the page that
clears local state) is never charged again — `revivePurchasedCart`
(`src/lib/commerce/reviveCart.ts`) carries its current items into a fresh cart
and checkout proceeds invisibly; the response's `replacedCart` tells the
client to adopt the new id/secret. Fulfilment also unlinks purchased carts
from the customer so the provider's user-join can never resurrect one.

- `POST /next/checkout/session` builds the session **from Postgres prices**
  (`src/lib/stripe/checkoutSession.ts` — pure, unit-tested builders; ad-hoc
  `price_data`, still no Stripe catalogue). Cart auth = owner cookie or the
  guest cart secret (timing-safe compare). Open sessions are reused on
  refresh; a changed cart expires the stale session so a stale total can
  never be paid.
- The PaymentIntent is created **lazily by Stripe at confirmation** (API
  2022-08-01+), so transactions are keyed by `stripe.checkoutSessionID` first;
  the PI id is stamped at completion. `stripe.apiVersion` is **pinned to
  `2025-08-27.basil` in `src/lib/stripe/client.ts`** because the parsing
  depends on version-specific fields (`session.collected_information.
  shipping_details`; the `ui_mode` enum renames in 2026-03-25 "dahlia").
- Fulfilment is ONE idempotent function, `fulfillCheckoutSession`
  (`src/lib/stripe/fulfillSession.ts`), called from the `checkout.session.*`
  webhooks AND the return page (`/next/checkout/confirm`, `?session_id=`);
  every duplicate converges on the `transaction.order` guard.
- The old ~11–16-item metadata ceiling is gone: an oversized
  `cartItemsSnapshot` is **omitted** (never truncated) and `ensureOrder`
  rebuilds from the transaction row.
- The plugin's `initiatePayment`/`confirmOrder` endpoints remain mounted but
  the UI no longer calls them. `enrichStripeTransaction` no-ops on
  session-first rows (no PI at create) — its job moved into fulfilment, fed
  by Stripe-collected data.
- Per-shop launch: set the Stripe dashboard **business name + Checkout
  branding** (logo/colours) — the hosted page shows them. No Apple Pay domain
  registration is needed for hosted Checkout; wallets/Link/BNPL are dashboard
  toggles.

You would only need real Stripe Product/Price objects for **subscriptions**,
Stripe-hosted **pricing tables**, or **Stripe Tax** product tax codes. None are
in scope.

### Webhooks

Endpoint: **`/api/payments/stripe/webhooks`** (the plugin mounts payment
endpoints at `/api/payments/{method}`).

Handlers live in `src/lib/stripe/webhookHandlers.ts`. **The adapter only reacts
to events listed there** — anything else is ACKed with 200 and discarded, so
adding an endpoint in the Stripe dashboard does nothing unless the event also
appears in that map. The admin page reads the same map, so it cannot drift.

Handled: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`payment_intent.succeeded`, `payment_intent.payment_failed`,
`charge.refunded`, `charge.dispute.created`.

Signature verification is the plugin's; handlers run **only** for events whose
signature verified. A POST with no `stripe-signature` header is ACKed with 200
rather than rejected — cosmetic, since no handler runs.

#### Idempotency — do not weaken this

Stripe retries until it gets a 2xx and **will** deliver the same event twice.
Two independent guards:

1. `stripe-events` collection — `eventId` has a **unique index**. Every handler
   claims the id first; a duplicate loses that insert and returns.
2. `ensureOrderForPaymentIntent` — returns early if the transaction already has
   an `order`, so even a bypassed ledger cannot double-create.

Handlers **swallow** errors after recording them in the ledger. Throwing would
return non-2xx and make Stripe retry a genuine bug for ~3 days.

#### Known bugs in `@payloadcms/plugin-ecommerce` 3.86.0

Found by reading the source; all worked around, none patched upstream. Re-check
these on upgrade:

| Issue | Impact | Our mitigation |
|---|---|---|
| `confirmOrder` has **no idempotency check** | Two calls with one PaymentIntent create two orders and two stock decrements | Our webhook path guards on `transaction.order`; the ledger guards the event |
| Inventory decrement uses Mongo `$inc` | Not a Postgres operator | `src/lib/stripe/inventory.ts` does atomic `SET inventory = inventory - $1` via `payload.db.pool` |
| Inventory only decrements in the `confirmOrder` **endpoint** | A webhook-created order would never decrement stock | `ensureOrder` decrements explicitly |
| Variant validation is dead code — `if (item.variant)` nested inside `if (!item.variant)` | Variant price/stock is never validated at checkout | Not yet mitigated — see open questions |

Prices are **not** client-controllable: `initiatePayment` loads the cart
server-side by id, and the carts `beforeChange` hook recomputes `subtotal` from
DB prices on every write.

#### Dispatch address — where it lives and why

The plugin stores `billingAddress` on the transaction but **not**
`shippingAddress`; that existed only inside `paymentIntent.metadata` as a JSON
string. Metadata is capped at **500 characters per value** and is not a
database, so the address a parcel needs was the least durable thing in the
system.

`enrichStripeTransaction` (afterChange on transactions, create only) fixes it:

1. Copies the shipping address from metadata into `transactions.shippingAddress`
   in Postgres.
2. Sets the PaymentIntent's **native `shipping`** field — Radar scores fraud on
   it and it is core chargeback evidence; an address in metadata is invisible to
   both.
3. Fills in the Stripe **Customer** (name, phone, address) — the plugin creates
   it with an email and nothing else.

Resolution order when building an order:
`metadata.shippingAddress` → `transaction.shippingAddress` → `transaction.billingAddress`.

Each candidate is tested with `isDispatchable()`, **not truthiness** — Payload
always materialises a group field as an object with null members, so
`if (!address)` is never true and would silently pick an empty address over a
complete one.

An order with no usable address is still created (the money is already taken)
but logged at error level and returned with `dispatchable: false`.

⚠️ **Cart size ceiling.** `cartItemsSnapshot` goes into that same 500-char
metadata value: roughly **16 line items**, or **11 with variants**, before
Stripe rejects the call. `ensureOrder` falls back to the transaction's own items,
but the *checkout itself* would fail at that size. Untested against a real cart
that large — verify before selling bundles.

⚠️ **The shop is USD-only.** `enum_orders_currency = USD`; no `currencies`
config is passed to the plugin. Product prices live in `priceInUSD`, and the
Merchant Center mapper reads that field. Selling in EUR needs the plugin's
`currencies` option, a `priceInEUR` field, and a mapper update — a schema
change, so it is a deliberate decision, not a default.

⚠️ Postgres returns `numeric` columns as **strings** through `pg`. Coerce with
`Number()` — a `typeof x === 'number'` check on a raw query result silently
never fires. This already caused a dead oversell check.

---

## 5. Repo conventions

- `.vscode/settings.json` and `.vscode/extensions.json` are committed (shared
  team config). Personal overrides go in `CLAUDE.local.md` / `settings.local.json`,
  both gitignored.
- Project accent colour is `#00b4d8` — set on the VS Code title bar so this
  window is identifiable at a glance.
- `.env.example` is committed and is the **source of truth for env var names**.
  Real `.env*` files are never committed.
- Secrets patterns already blocked in `.gitignore`: `service-account*.json`,
  `gcp-credentials*.json`, `*.pem`, `*.key`.

---

## 6. Working agreements for Claude

- **Verify library versions and API surfaces before writing integration code.**
  This project sits on top of several fast-moving APIs (Next.js, Payload,
  Stripe, Merchant API). Training data is likely stale — check the actual docs
  or the installed package.
- Prefer server components and server actions; keep client bundles small.
- Never write real credentials into files. Add the variable name to
  `.env.example` and tell the user to fill it in.
- When adding a dependency, state its licence if it is anything other than MIT.
- Money is handled in **integer minor units** (cents), never floats.

---

## 7. Decision log

Record significant choices here as one-liners with a date, and put the longer
reasoning in `docs/decisions/`.

| Date | Decision | Why |
|---|---|---|
| 2026-07-27 | Build against Google **Merchant API**, not Content API | Content API shuts down 2026-08-18 |
| 2026-07-27 | Reject `commerce-kit` / YourNextStore | Engine is AGPL-3.0-only, closed source, requires hosted `YNS_API_KEY` |
| 2026-07-27 | Reject `next-saas-stripe-starter` as the base | SaaS subscription template, no catalog/cart/orders; last commit 2024-08 |
| 2026-07-27 | **Base = Payload CMS 3 + plugin-ecommerce** | MIT, admin+storefront in one Next.js app, ships orders/carts/variants, we own the Postgres schema |
| 2026-07-27 | Harvest Stripe webhook patterns + shadcn setup from `next-saas-stripe-starter` | Reference material, not foundation |
| 2026-07-27 | **Affiliate products excluded from Merchant Center feed** | Google policy bans affiliate links in Shopping; risks account-level suspension |
| 2026-07-27 | Catalogue has 3 modes: `direct` / `dropship` / `affiliate` | `dropship` makes partner products feed-eligible by making us merchant of record |
| 2026-07-30 | **Stripe keys managed in admin**, encrypted, env fallback | Owner decision; per-shop workflow beats env-file edits. Write-only fields + AES-256-GCM make DB storage acceptable |
| 2026-07-30 | **Checkout = hosted Stripe Checkout** (Sessions API, redirect) | Owner decision after research; Stripe-maintained form (autocomplete, wallets, Link) with zero per-shop upkeep; on-site review step signposts the redirect per Baymard |
| 2026-07-30 | **Variants = sibling PRODUCTS sharing `itemGroupId`** (Amazon model), not plugin variants | Owner decision, evidence-backed: Google's feed spec mandates one offer per variant with own link/image/GTIN + shared item_group_id; the bundled model hid 17 products from the feed, showed wrong photos, and discarded sibling GTINs |
| 2026-07-30 | **Discounts = lower `priceInUSD` + display-only `compareAtPriceInUSD`**, hook-guarded; GMC gets `price`=was / `salePrice`=charged | Effective-price hooks fail on 4 verified grounds (cart select, plugin payment endpoint, SQL sort, admin round-trip); this model makes display/charge divergence structurally impossible |
| 2026-07-30 | Discount badges use **percent framing ("8% off")**; savings row in cart+checkout | Owner choice (over dollars-off recommendation); ~50% of catalogue seeded at 6–10% off (6% floor clears Google's >5% annotation threshold) |
| 2026-07-30 | **Categories = path routes** (`/shop/<slug>`), paginated; robots+sitemap at app root; all SEO identity from Company global | SEO audit: 334/382 products uncrawlable, robots.txt 404, vendor branding live on policy pages; path categories are rankable landing pages |
| 2026-07-30 | **AI crawlers allowed** in robots.txt (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) | Owner decision; GEO stance — server-rendered product/policy pages exist to be cited |
| 2026-07-30 | **Affiliate PDPs indexed, `rel="sponsored"`, NO visible disclosure** | Owner decision over recommendation; FTC/EU disclosure requirement flagged to pre-launch legal review |
| 2026-07-30 | **Home/category/product pages STATIC** (ISR), purged by Payload hooks; search/sort split to dynamic `/search` | Owner decision (Shopify-style cached storefront); 497 pages prerendered, ~4ms TTFB, storefront survives DB outages; static pages can't read query strings, hence path pagination + /search |
| 2026-08-03 | **GA4 via admin-managed measurement ID** (Settings → Analytics), plain gtag.js, full e-commerce funnel incl. server-built purchase payload | No new dependency; ID is public so stored in clear; item_id = slug = GMC offerId for cross-tool joins; purchase deduped by order id in localStorage |
| 2026-08-03 | **Cookie consent = Google Consent Mode v2**, bottom banner with Accept+Decline, admin toggle (default ON) | Consent Mode is the signal Google natively recognizes (EEA-mandatory for ads); defaults denied before gtag config; Decline included because accept-only banners are legally invalid consent |
| 2026-08-10 | **Consent Mode default flipped to GRANTED** (opt-out): tracking starts on load, Decline pulls the visitor down to denied from then on | Owner decision, overriding the 2026-08-03 opt-in default; requested for immediate Realtime tracking without waiting on Accept clicks. ⚠️ Opt-out for non-essential analytics cookies is very likely non-compliant for EU/UK visitors (ePrivacy/GDPR require prior opt-in) — folded into the existing pre-launch legal review, not yet reviewed by counsel |
| 2026-08-11 | **GMC misrepresentation audit — 15 products, 28 field fixes** (title/color/size/description contradictions) | Owner-reported: some titles named a different colour/quantity than the description. Root causes found in the original import CSV (`imports/hot_products_rewritten.csv`, gitignored): a stray `color`/`size` field populated on standalone (non-`itemGroupId`) products where the schema never intended it (leaks into the feed + PDP JSON-LD regardless — the mapper and `page.tsx` read it unconditionally); two products with cross-contaminated `size` values (identical corrupted string on two unrelated wine coolers); a handful with the wrong number restated in the title/description vs. the CSV's original (pre-rewrite) `title` column. Scripts kept for reuse on the next catalogue: `src/scripts/gmcMisrepresentationAudit.ts` (title/desc vs. color-word + capacity heuristics), `gmcMisrepresentationAuditV2.ts` (garbage-field + cross-contamination + container-quantity heuristics), `gmcApplyFixes.ts` (the applied fix list, exact-match guarded per field so a concurrent admin edit can't be clobbered). ⚠️ Running fixes via `payload.update()` in a standalone script does NOT purge the static cache (same `revalidatePath`-only-works-in-process gotcha as bulk seed scripts) — a rebuild + `pm2 restart` was required afterward to bake the corrected data into the prerendered pages. |
| 2026-08-11 | **`shortDescription` truncation fixed — 230 products** | Same root cause as the title truncation below: the import pipeline hard-caps `shortDescription` at its 300-char field max and was cutting mid-sentence with a trailing "…", which also fed the PDP's JSON-LD `description` (reads `product.shortDescription` in `page.tsx`). Confirmed the full, untruncated text existed for all 230 in the `description` richText field (no length cap), so `src/scripts/gmcFixShortDescTruncation.ts` rebuilds each one from complete clauses (splits on `. ` + capital letter, safe against unit abbreviations like "2 qt." since those aren't followed by a capital) greedily packed under 300 chars — shorter-but-complete beats longer-but-severed. Dry-run reviewed before applying; zero skips. |
| 2026-08-11 | **`brand` field wrong on 19 products, fixed** — found in a broader final audit alongside a clean re-check of everything fixed above (0 leftover contradictions, 0 duplicate GTINs, 0 bad compareAt prices, 0 condition contradictions, 0 variant-family attribute collisions) | `src/scripts/gmcBrandCrossCheck.ts` confirmed every product's `brand` faithfully matches its own CSV row — so the earlier import wasn't the bug this time, the CSV's `brand` column itself names the wrong company for a subset of rows (title names a different, real one). Each of the 19 was verified against a live source (WebSearch — the real brand's own site or a major retailer listing) before fixing, not guessed; two were serious false-trademark claims (`PHILIPS` and a random reseller name on a product that's genuinely Weber's, both corrected). One case ran the other direction — id 556's `brand` (Wakoli) was the one confirmed correct by the ASIN's real Amazon listing, and the TITLE was wrong (borrowed an unrelated Thor Kitchen model name), so the title was rebuilt instead. Scripts: `gmcFinalAudit.ts` (the broad re-check + brand-not-in-title heuristic), `gmcBrandCrossCheck.ts`, `gmcBrandFixes.ts` (applied list with sources cited per fix). ⚠️ Roughly 80 of the ~99 "brand not in title" heuristic hits were false positives (parent/sub-brand relationships like Sage=Breville in Europe, or a product-line name like Le Creuset's "Signature" or Waterford's "Lismore") — this needs human judgment or verified search per case, not a blanket rule. |
| 2026-08-11 | **Feed-pipeline audit + fix: description was empty for the whole catalogue** | `src/scripts/gmcFeedAudit.ts` runs the REAL `buildFeed()`/`mapProduct()` code (not a reimplementation) against every product and cross-checks the output: 0 policy skips, 0 price-micros/GTIN-format/link/image/brand/availability/itemGroupId-family mismatches — the mapper's math and structural logic were already correct catalogue-wide. The one real finding: `meta.description` is empty for all 382 products (no hand-written SEO meta yet, the expected pre-launch state), and `mapProduct.ts` had no fallback for it — so the feed submitted zero descriptions while the PDP itself has one (JSON-LD/OG already fall back to `shortDescription` via `generateMeta.ts`'s documented contract). Page and feed had silently diverged. Fixed by giving the mapper the identical fallback chain (`meta.description \|\| shortDescription`), pinned in `merchantMapper.int.spec.ts`. No markets are configured yet on the Merchant Center global (empty array) — the mapper/preview/live feed all correctly fall back to the hardcoded US/en/USD default in that state, so this isn't a bug, just unconfigured. |
| 2026-08-11 | **Reviews were showing a false "Verified Purchase" badge on ~97% of them — fixed** | The GMC/legal review turned up something more serious than any product-data issue: all 4,031 reviews are imports (`originalCreatedAt` set on every one, zero organic reviews exist), and the importer (`src/lib/import/run.ts`) copied the SOURCE marketplace's `is_verified` flag straight into `verifiedPurchase`, which `Reviews.tsx` renders as a "✓ Verified" badge — a claim, in ordinary badge semantics, that the reviewer bought THIS item from THIS store. None of them did; it verified a purchase on a different platform. This is a real FTC problem (16 CFR Part 465, the 2024 rule on misattributed reviews), not a cosmetic one, and a Google Merchant Center reviews-policy problem too. Fixed both ends: `verified_purchase` set false on all 3,910 rows that had it true, and the importer changed to never set it true for an import (the honest default is `false`; only a review genuinely tied to an on-site order should ever earn the badge — no such flow exists yet). Added a plain disclosure line to the reviews section ("Reviews reflect customer experiences with this product, gathered across retail channels") — the standard, legal pattern large retailers use for syndicated review content. The review TEXT/rating/photos stayed — nothing dishonest about displaying real feedback about the real product, the violation was specifically the false verification claim. |
| 2026-08-11 | **All 50 mid-word-truncated titles fixed** (the finding logged 2026-08-11 earlier, deliberately deferred at the time) | `src/scripts/gmcFixTruncatedTitles.ts`: rebuilds the base-name segment from the CSV's own untruncated `title` column, prepended to the EXISTING suffix (size/color/category, never touched by the truncation bug). The real risk flagged earlier — a raw title's own trailing "- Black" style tail contradicting the catalogue's already-verified `color` field — is handled by stripping that tail specifically when it names a conflicting color (color-word extraction, same list as the misrepresentation audit scripts), not just blindly concatenating. Also surfaced and fixed a pre-existing "Sliver"/"Sliver" typo (3 products, should be "Silver") that the restored title text would otherwise have exposed as a fresh-looking contradiction. Reviewed a dry run (checked for dangling trailing punctuation/connectors after cleanup) before applying; 47 of 50 needed a change, 0 skipped on the real run. |
| 2026-08-11 | **11 more wrong `brand` fields fixed (round 2)**, one more title fixed the other direction | Same web-search-verified standard as the first 19-item round: Gaggia→Lelit, Gourmia→Statesman, Ninja→Wards, VEVOR→WarmieHomy, Midea→BridgePro, CRAFTGEN→Groovy Guy Gifts, HOMICHEF→UUDULY, ciwete→UUDULY (×2 different products), VEVOR→Latitude Run, VEDNHOL→Chef James (lower confidence, no exact-ASIN cross-check). One ran the OPPOSITE direction: id 471's `brand` field ("ciwete") was already correct — confirmed via the exact ASIN's real Amazon listing — and the TITLE had borrowed an unrelated "Revere Gourmet" name; the title was rebuilt instead. Several candidates were checked and left alone as genuine false positives: Fellow/"Pirch" (Fellow's own glassware line), HexClad/steak-knife-set (HexClad does sell matching Damascus steak knives directly), Joseph Sedgh Collection (real, matching category — the title's "By Bone" fragment is a garbled "Bone China" mention, not a brand claim, left as a known minor title-quality issue). A handful of lower-stakes candidates (both names obscure/unverifiable, e.g. DAOFEL/JFVKAF, MOKKOM/Anqtovp) were left unresolved — real risk is low when neither side is a recognizable trademark. `src/scripts/gmcBrandFixesRound2.ts`. |
| 2026-08-12 | **All manufacturer-warranty language replaced with one store-backed guarantee — the 40tag 24-Month Guarantee** | Owner decision: 40tag is not an authorized retailer for the brands it sells (All-Clad, KitchenAid, Blackstone, etc.), so it cannot promise their manufacturer warranties will be honored. Single source of truth added at `src/lib/commerce/guarantee.ts` (`GUARANTEE_NAME`/`GUARANTEE_TAGLINE`), imported by both `Reassurance.tsx` (PDP — replaced the old per-product `product.warrantyMonths`-derived "X-year warranty" claim with a static, always-shown "Backed by the 40tag 24-Month Guarantee" line) and `TrustRow.tsx` (homepage — replaced `company.defaultWarrantyMonths`-derived text with static "24-Month Guarantee / We repair or replace, on us"), so the two surfaces structurally cannot drift the way the old per-product/per-company fields could. Terms' "Warranties" section and the FAQ's "Is there a warranty?" answer both rewritten to the owner's exact wording and re-seeded to production (`seedPolicies({ only: ['terms','faq'] })` — the HTTP seed route only exposes an all-5-pages `overwrite`, so this ran as a script instead to avoid risking a clobber of hand-edited returns/shipping/privacy). `warrantyMonths` (Products) and `defaultWarrantyMonths` (Company) are now unused — left in the schema rather than dropped (a destructive change) but their admin descriptions say so explicitly. Product-copy sweep found manufacturer-warranty clauses in far more products than a first pass caught: checking only `shortDescription` (300-char capped) missed the uncapped `description` field, which often has the trailing "Backed by (limited) lifetime warranty" sentence that `shortDescription` had already been truncated before reaching — 30 products total needed the clause stripped (cleanly, no dangling fragments; verified via `warrantyFinalAudit.ts`). Three products (587, 575, 568) were deliberately left untouched — "beautiful, lifetime." is a customer-feedback-theme keyword, not a warranty claim, flagged for owner review rather than guessed at. Also deliberately untouched: 103 review bodies mentioning "warranty"/"lifetime" — genuine customer text, not a store claim; editing real reviews to fit a narrative would be its own problem given the review-authenticity work done the day before. |
| 2026-08-03 | **Google service-account key admin-managed** (write-only, sealed) in Settings → Merchant Center; feed-targeting/dry-run env vars retired; minimum .env = 4 vars | Owner decision; the env-only rule explicitly allowed this once given the Stripe treatment; markets/ID/dryRun already lived in settings |
| 2026-08-03 | **Email = own mailbox via SMTP/IMAP** (Settings → Email, encrypted creds), no external email API; order confirmation + tracking emails hook orders; Mail inbox+reply inside the admin | Owner decision at ~20–30 emails/day; nodemailer MIT-0 + imapflow/mailparser/sanitize-html MIT; idempotency stamps; live IMAP reads, no mailbox mirror |
| 2026-08-03 | **Mobile: stacked card anatomy + 2-up grids + chip category nav** — ProductGridItem stacks clamped title over price below `sm:` (side-by-side row kept above); /shop & /search go `grid-cols-2` on phones; shop sidebar becomes a scrollable chip strip below `lg` (children of the active branch as a 2nd row); cart drawer full-width on phones, 2-line title clamp. ⚠️ Never put `flex` on a `Price` — it drops the text space between charged and struck prices | Live audit at 390px: the title/price baseline row crushed titles into 8-line columns in every 2-up grid; 16 stacked sidebar links pushed the first product a viewport below the fold |

---

## 8. Scratch / open questions

- [ ] A handful of "brand-not-in-title" candidates from the 2026-08-11 GMC
      audit were left unresolved on purpose — both the field and the title
      name an obscure, unverifiable brand (e.g. DAOFEL/JFVKAF, MOKKOM/
      Anqtovp), so misattribution risk is low (neither is a real trademark
      to falsely claim) and a confident web-search verification wasn't
      possible. Revisit if time allows; not blocking.
- [ ] Id 602 (Joseph Sedgh Collection dinnerware) has a garbled title
      fragment ("By Bone Dinnerware Set Armonia" — likely a mangled "Bone
      China" mention) — a title-quality issue, not a brand mismatch (the
      brand field is confirmed correct). Cosmetic, not fixed yet.
- [ ] No Merchant Center account is actually connected yet: `enabled`
      is false, no Merchant Account ID, no service-account key, no active
      market, and the feed token has never been minted (the settings page
      has never been saved since its initial creation on 2026-08-03) — the
      live feed URL is currently unreachable, including by Google. This is
      the one remaining step before Shopping submission and it needs the
      account owner: create/verify the Merchant Center account with Google,
      then in Settings → Google Merchant Center set the Account ID, add an
      active market, and save once (auto-mints the token).
- [ ] Choose Postgres host (Neon / Supabase / self-host)
- [ ] Confirm target countries, then check **CSS status per country** — in CSS
      program countries Shopping ads must run *through* a CSS; several
      smaller EU markets are only "soon available".
- [ ] Decide multi-currency / multi-region scope — affects Merchant Center feeds
      (one feed per country/language target)
- [ ] Tax & VAT handling (Stripe Tax vs external)
- [ ] Shipping rates model — Merchant Center requires shipping data per product
- [ ] **Affiliate disclosure (LEGAL)**: `rel="sponsored"` is done; owner chose
      to ship WITHOUT the visible disclosure the FTC / EU consumer law
      normally require — must be reviewed by counsel before any affiliate
      product goes live (pages are indexed, decision 2026-07-30)
- [ ] Audit which affiliate partners could become `dropship` suppliers instead
- [ ] **Variant checkout validation** — the plugin's variant price/stock check is
      unreachable dead code. Add our own validation via the ecommerce plugin's
      `productsValidation` option before selling anything with variants.
- [ ] Alerting on `stripe-events` with `status: failed`, and on oversell warnings
- [ ] Decide dispute policy — `charge.dispute.created` currently cancels the
      order; confirm that is right before going live
- [ ] Retention/pruning for `stripe-events` (it grows forever)
- [ ] **Currency**: shop is USD-only. Confirm the selling currency — EUR needs a
      plugin `currencies` config, a `priceInEUR` field and a mapper change
- [ ] Verify checkout with a cart above ~11 items (Stripe metadata ceiling)
- [ ] Collect the customer's phone at checkout — carriers need it for delivery
      notifications, and it is useful chargeback evidence
- [ ] Constrain the address `country` field to ISO alpha-2 (Stripe rejects
      anything else; we currently drop invalid values silently)
- [ ] Show `dispatchable: false` orders prominently in the admin
- [ ] **Auto-revert job for `saleEndsAt`** before running the first genuinely
      timed sale — currently the price does not revert itself; an overdue sale
      only surfaces as a feed-preview warning
- [ ] Extend the pre-launch legal review to REFERENCE PRICING: `saleStartedAt`
      provides §17501/FTC provenance, but whether a compareAt was "the
      prevailing market price within 90 days" is a human judgment per sale
