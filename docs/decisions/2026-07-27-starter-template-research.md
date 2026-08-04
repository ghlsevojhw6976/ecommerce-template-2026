# Starter template research — 2026-07-27

Goal: pick a **free, permissively-licensed** Next.js starter to base custom
e-commerce infrastructure on, with real catalog / cart / order management, Stripe
payments, and a data model we control well enough to feed Google Merchant Center.

All figures pulled from the GitHub API on 2026-07-27.

---

## Recommendation: Payload CMS + `@payloadcms/plugin-ecommerce`

`templates/ecommerce` in the [payloadcms/payload](https://github.com/payloadcms/payload) monorepo.

| | |
|---|---|
| Licence | **MIT** (both core and the ecommerce plugin) |
| Stars | 43,822 |
| Last push | 2026-07-27 (same day) |
| Plugin version | `@payloadcms/plugin-ecommerce` 3.86.0, MIT |

**Why it wins:**

- **Runs *inside* Next.js.** Payload 3 is not a separate service — the admin
  panel and the storefront are one Next.js app, one deployment. No second
  backend to host, no API hop between storefront and catalog.
- **Real commerce data model, not a toy.** The plugin ships collections for
  `products`, `variants`, `carts`, `orders`, `transactions`, `addresses`,
  `categories` — verified in the source tree, not just claimed in a README.
- **Admin panel is free and included.** Order management, inventory, and product
  editing come out of the box. This is the piece every "free ecommerce starter"
  listicle glosses over — most of them have a storefront and no back office.
- **Pluggable payment adapters**, with a Stripe adapter in-tree.
- **We own the Postgres schema.** This is the decisive point for Merchant Center:
  the product feed is a query against our own database. Payload generates
  TypeScript types from the schema, so feed-mapping code is type-checked.

**Trade-offs, honestly:**

- Payload is a bigger concept to learn than a plain Next.js template — you're
  adopting a framework, with its config/hooks/access-control model.
- The ecommerce plugin is newer than Payload core; expect to write some of the
  checkout glue yourself.
- Migrating off Payload later means migrating the CMS layer, not just swapping a
  component library.

---

## Runner-up: Medusa v2 + `dtc-starter`

| | |
|---|---|
| Licence | MIT |
| Medusa core | 35,399 stars, pushed 2026-07-27 |
| Storefront | [medusajs/dtc-starter](https://github.com/medusajs/dtc-starter) — 89 stars, created 2025-11-17, pushed 2026-07-27 |

Medusa is the more mature *commerce* engine of the two — better multi-region,
multi-currency, promotions, fulfilment and returns primitives. If the roadmap
involves serious international selling, this is the stronger long-term base.

⚠️ **Important correction to the common advice:** the widely-recommended
`medusajs/nextjs-starter-medusa` was **archived on 2026-07-02**. Its README now
points to `dtc-starter`. Any blog post recommending the old starter is stale.

Why it's the runner-up and not the pick: Medusa is a **separate backend service**
— two apps to deploy and operate instead of one, and the new storefront starter
is young (89 stars, ~8 months old). More operational overhead than we need to
start with.

---

## Rejected

### YourNextStore — ❌ licence disqualifier

5,464 stars, actively developed, markedly good AI-tooling ergonomics (ships
`CLAUDE.md`, `.claude/`, `.mcp.json`). Superficially the most attractive option.

Two disqualifiers found by checking past the README:

1. Its engine, the `commerce-kit` npm package, is **AGPL-3.0-only** with **no
   public source repository**. AGPL's network clause is triggered by operating a
   public web store — incompatible with proprietary commercial infrastructure.
2. It requires a `YNS_API_KEY` from a hosted service (`yns.store`) — so core
   commerce does not run on our infrastructure alone.

Also pinned to `next@16.3.0-canary` and a canary React build.

### Vercel Next.js Commerce — ❌ wrong architecture

14,178 stars, MIT, well built — but it is a **Shopify** storefront. Shopify owns
the catalog and orders, which is the exact dependency this project exists to
remove.

### `mickasmt/next-saas-stripe-starter` (current familiar base) — ❌ wrong shape

2,999 stars, MIT — but **last commit 2024-08-16**, ~2 years stale, on Next.js 14
and Auth.js v5 beta. More fundamentally it's a **SaaS subscription** starter:
user roles, billing plans, marketing pages. There is no catalog, no cart, no
variants, no orders, no fulfilment. Using it would mean building all of commerce
from scratch on top of an aging auth/billing shell.

Its genuinely reusable ideas — Stripe webhook wiring, the shadcn/ui setup, the
admin-panel layout — are worth borrowing as reference rather than as a base.

### Others reviewed and set aside

- **Saleor storefront** — mature engine, but GraphQL + Python backend, non-standard
  licence (`NOASSERTION`), heavier than needed.
- **Singitronic** (664 stars) — separate Node backend, tutorial-grade code quality.
- **Relivator** (1,558 stars, moved to `reliverse/relivator`) — last push
  2025-10-04, and it's SaaS-commerce oriented rather than catalog-first.
- **NextMerce / TailAdmin** — UI templates only, no commerce backend.

---

## Cross-cutting finding: the Merchant API deadline

Independent of template choice — **Google's Content API for Shopping shuts down
18 August 2026** (three weeks from today), replaced by the Merchant API.

No starter template in this survey ships Google Merchant Center integration.
That layer is ours to build regardless, which further supports picking on the
strength of the **data model** rather than on bundled integrations.
