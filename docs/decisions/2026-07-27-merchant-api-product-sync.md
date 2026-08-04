# How products reach Google Merchant Center — 2026-07-27

**Short answer: via Merchant API v1 `productInputs.insert`. We never touch the
Content API, so the 18 August sunset is a non-event for us — provided we don't
copy stale sample code.**

---

## The timeline, precisely

Two separate deadlines get conflated in most write-ups:

| Date | What happened / happens |
|---|---|
| **28 Feb 2026** | *Passed.* Merchant API **v1beta** discontinued. All calls must target **v1**. |
| **18 Aug 2026** | Content API for Shopping stops accepting product data. Every call starts failing at 00:01 UTC. |

Merchant API **v1 has been GA since summer 2025**. It is not a beta we're
betting on — it's the supported product, and it is how products are added both
before and after August.

The sunset only breaks *existing* Content API integrations. We are greenfield,
so we have nothing to migrate. Our only real exposure is **following outdated
tutorials** — the majority of sample code online still targets `content/v2.1`.

Note: `v1beta` also appears in current Google sample code and doc URLs. Target
`v1` regardless of what a sample shows.

**Safety valve:** Google accepts extension requests for Content API access
until 15 Oct or 31 Dec 2026. Irrelevant to us; relevant if we ever inherit a
legacy integration.

---

## How the upload actually works

Merchant API is not a single feed endpoint. Products go through a container.

### 1. Create an API data source — once, per market

Products cannot be inserted into nothing. You must first create a data source
of type **API** (`accounts.dataSources.create`). File-based or scheduled-fetch
data source types will **not** accept API writes.

One primary data source per `(feedLabel, contentLanguage)` pair — so a
a country/English market and the same country/local-language market are separate sources.

### 2. Insert product inputs

```
POST /accounts/{account}/productInputs:insert?dataSource={dataSource}
```

Identity is the composite key:

```
contentLanguage ~ feedLabel ~ offerId
```

Required on every input: `offerId`, `contentLanguage`, `feedLabel`. Insert is an
upsert against that key — re-inserting the same key updates the product, so we
don't track a separate "created vs updated" state.

### 3. Read back what Google actually did

`productInputs` is what we *send*. `products` is what Google *built* — after
feed rules and processing — and it carries the disapproval issues. Two different
resources, and the second is the one worth alerting on. A silent 200 on insert
does not mean the product is live.

---

## ⚠️ Products expire after 30 days

This is the operational detail that catches people out, and it changes the
architecture: **a one-time push is not enough.** Google expires API-uploaded
products unless refreshed at least every 30 days.

So the sync is a **scheduled job**, not a deploy-time script:

- **Full refresh every 14 days** — comfortably inside the 30-day window, so one
  failed run is not an outage.
- **Delta push on change** — a Payload `afterChange` hook pushes the single
  product when it's edited, so price and stock changes reach Shopping in
  minutes rather than waiting for the next full run.

Price/availability drift is the top cause of the "mismatched value" disapproval,
so the delta path matters commercially, not just technically.

Supplemental data sources exist for overriding specific attributes on products
that already exist in a primary source. We don't need them yet — our catalogue
has a single source of truth (our Postgres) — but they're the right tool if we
later ingest a supplier feed we don't fully control.

---

## What we build

```
src/lib/merchant/
  client.ts      — auth + ProductInputsServiceClient (v1)
  dataSource.ts  — ensure the API data source exists per market
  mapProduct.ts  — Payload Product -> Merchant API ProductInput
  sync.ts        — full refresh + single-product delta
  issues.ts      — read processed products, surface disapprovals in admin
```

**The feed query is the guard.** Every path into the mapper filters on:

```ts
where: {
  feedEligible:   { equals: true },   // derived — affiliate can never be true
  excludeFromFeed:{ not_equals: true },
  _status:        { equals: 'published' },
}
```

`feedEligible` is already enforced and tested
(`tests/int/feedEligibility.int.spec.ts`).

### Field mapping

| Merchant API | Source |
|---|---|
| `offerId` | product slug (stable, human-readable in MC reports) |
| `title` / `description` | product fields |
| `link` | `NEXT_PUBLIC_SERVER_URL` + slug |
| `imageLink` / `additionalImageLinks` | gallery |
| `price` | price in **minor units** → `{amountMicros, currencyCode}` |
| `availability` | inventory + supplier status |
| `brand`, `gtin`, `mpn`, `condition` | Sourcing & Feed tab |
| `googleProductCategory` | Sourcing & Feed tab |
| `shippingLabel` | supplier's `shippingLabel` — lets MC apply per-supplier rates |

Note the unit conversion: Merchant API uses **micros** (1 EUR = 1,000,000), we
store **cents**. Multiply by 10,000. Getting this wrong by an order of magnitude
is both an easy mistake and an expensive one.

Variants map to separate product inputs sharing an `itemGroupId`.

---

## Dependencies

Verified on npm, 2026-07-27:

| Package | Version |
|---|---|
| `@google-shopping/products` | 0.9.0 |
| `@google-shopping/datasources` | 0.11.1 |
| `@google-shopping/inventories` | 0.12.1 |
| `google-auth-library` | 10.9.1 |

⚠️ The Shopping clients are still **0.x** — treat minor bumps as potentially
breaking and pin exact versions. (`@google-shopping/merchant-products` does not
exist; the correct name is `@google-shopping/products`.)

Auth: a Google Cloud **service account** granted access to the Merchant Center
account. Key stored outside the repo — `.gitignore` already blocks
`service-account*.json` and `gcp-credentials*.json`.

`GOOGLE_MERCHANT_DRY_RUN=true` builds and validates the payload without calling
Google. Stays true until we've reviewed real output against the live catalogue.

## Sources

- [Manage your products](https://developers.google.com/merchant/api/guides/products/overview)
- [Add and manage products](https://developers.google.com/merchant/api/guides/products/add-manage)
- [productInputs.insert reference](https://developers.google.com/merchant/api/reference/rest/products_v1beta/accounts.productInputs/insert)
- [Products sub-API RPC reference](https://developers.google.com/merchant/api/reference/rpc/google.shopping.merchant.products.v1)
- [@google-shopping/products on npm](https://www.npmjs.com/package/@google-shopping/products)
