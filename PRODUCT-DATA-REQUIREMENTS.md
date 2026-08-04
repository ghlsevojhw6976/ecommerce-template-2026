# Product Data Requirements

What to collect for every product before it goes live. Written to be handed to
whoever gathers the data — suppliers, a VA, or a scraping pipeline.

Two forces decide this list, and neither is negotiable:

- **Google Merchant Center** rejects products with missing or wrong attributes.
  A disapproved product earns nothing.
- **Conversion research** (Baymard, 71,000 hours of usability testing) shows
  which missing fields make people abandon a product they were willing to buy.

Every field below says which force it serves.

---

## How to read this

| Tier | Meaning |
|---|---|
| 🔴 **Required** | Product cannot be listed. Merchant Center rejects it, or the page is broken without it. |
| 🟠 **High value** | Measurably costs sales when missing. Gather for every product. |
| 🟡 **Nice** | Gather where cheap. |

Money is stored in **integer minor units** (cents). `€24.99` → `2499`. Never
decimals — see `CLAUDE.md`.

---

## 1. Identity

| Field | Tier | Format | Notes |
|---|---|---|---|
| `title` | 🔴 | text, ≤150 chars | Front-load the words people search. Pattern: **Brand + Model + Key Attribute + Type**. Merchant Center truncates around 70 in listings. |
| `slug` | 🔴 | `kebab-case` | Permanent. Changing it breaks the Merchant Center `link` and loses SEO. |
| `sku` | 🔴 | text, unique | Our internal identifier. |
| `brand` | 🔴 | text | Merchant Center requires it unless the product genuinely has no brand. |
| `gtin` | 🟠 | 8/12/13/14 digits | EAN/UPC/ISBN. **The single highest-value optional field.** Google matches offers across merchants on GTIN — without it you are invisible in comparisons. Ask every supplier. |
| `mpn` | 🟠 | text | Manufacturer part number. Use when no GTIN exists. |
| `condition` | 🔴 | `new` \| `refurbished` \| `used` | Defaults to `new`. |

> If a product has neither GTIN nor MPN, we must send `identifierExists: false`
> to Google. That is allowed but reduces reach — treat it as a last resort.

---

## 2. Commercial

| Field | Tier | Format | Notes |
|---|---|---|---|
| `price` | 🔴 | integer cents | Must match the price shown on the page **exactly**. Mismatch triggers Merchant Center disapproval. |
| `salePrice` | 🟡 | integer cents | Only when genuinely discounted. |
| `salePriceEffectiveDate` | 🟡 | ISO range | Required by Google if `salePrice` is set with an end date. |
| `currency` | 🔴 | ISO 4217 | ⚠️ **The shop is currently USD-only** — see `CLAUDE.md`. Confirm before bulk import. |
| `inventory` | 🔴 | integer | Drives `availability`. Dropship items track supplier stock instead. |
| `unitPricingMeasure` | 🟠 | e.g. `500ml`, `1kg` | **81% of sites omit unit pricing.** For anything sold by weight/volume/count, this lets us show "€0.74 per 100ml" — Baymard finds its absence causes comparison friction and abandonment. |
| `unitPricingBaseMeasure` | 🟠 | e.g. `100ml` | The denominator for the above. |
| `cost` | 🟡 | integer cents | Margin reporting. Never shown publicly. |

---

## 3. Images — the highest-leverage data you will gather

Product images do more conversion work than any text field. Baymard: **42% of
users try to judge physical size from images alone.**

| Requirement | Tier | Spec |
|---|---|---|
| Primary image | 🔴 | ≥1000×1000px, square, product on plain white, fills ~85% of frame. This is the Merchant Center `imageLink`. |
| No overlays on primary | 🔴 | Google rejects images with watermarks, logos, promotional text or borders. A "SALE" badge burned into the image = disapproval. |
| Additional angles | 🟠 | 3–6 images: front, back, side, detail/texture, packaging. |
| **In-scale image** | 🟠 | Product beside a common reference object, or held. **37% of sites lack this** and it is a top-10 Baymard gap. |
| **Human model image** | 🟠 | Anything worn or held. Shows fit and proportion that cut-outs cannot. |
| Lifestyle / in-use | 🟡 | Product in its real context. |
| Alt text | 🟠 | Describes the image, not the keyword. Accessibility + SEO. |

**File spec:** WebP or AVIF, sRGB, ≤500KB each, named
`{sku}-{01..n}-{angle}.webp`. Consistent framing across a category matters more
than any single image — inconsistent crops make a grid look amateur.

---

## 4. Variants

Only if the product has options (size, colour, material).

| Field | Tier | Notes |
|---|---|---|
| `variantType` | 🔴 | The axis: Size, Colour, Material. |
| `variantOptions` | 🔴 | Values per axis. |
| Per-variant `sku` | 🔴 | Each sellable combination needs its own. |
| Per-variant `price` | 🔴 | Even if identical. |
| Per-variant `inventory` | 🔴 | Variants hold their own stock. |
| Per-variant `gtin` | 🟠 | Different sizes have different GTINs. |
| Per-variant image | 🟠 | Colour variants **must** show that colour. |
| `itemGroupId` | 🔴 | Auto-derived — ties variants together in Merchant Center. |

> Baymard: **57% of sites hide variants in dropdowns.** We will render buttons
> with availability visible on each — which only works if per-variant stock
> data actually exists. Gather it.

---

## 5. Physical & shipping

Needed for accurate delivery cost and estimates. Baymard: **unexpected cost at
checkout is the single biggest abandonment cause (39%)** — you cannot show
honest shipping cost without these.

| Field | Tier | Format |
|---|---|---|
| `weight` | 🔴 | grams |
| `dimensions` | 🟠 | mm, L×W×H — volumetric weight decides courier price |
| `shippingClass` | 🟠 | standard / oversized / fragile / hazardous |
| `countryOfOrigin` | 🟡 | ISO alpha-2. Customs, and "Made in X" is a selling point. |
| `hsCode` | 🟡 | Customs tariff code. Needed for cross-border. |

---

## 6. Content

| Field | Tier | Notes |
|---|---|---|
| `shortDescription` | 🔴 | 1–2 sentences, shown near the buy button. Lead with the benefit. |
| `description` | 🔴 | Full rich text. ≥300 words for anything competitive. |
| `keyFeatures` | 🟠 | 3–6 bullets. The scannable layer people actually read. |
| `specifications` | 🟠 | Key/value pairs — material, capacity, power, compatibility. Renders as a spec table and answers pre-purchase questions. |
| `inTheBox` | 🟡 | What ships. Prevents "where is the cable" support tickets and returns. |
| `careInstructions` | 🟡 | Where relevant. |
| `googleProductCategory` | 🟠 | Google's taxonomy ID, e.g. `2271`. Improves matching. |
| `productType` | 🟡 | Our own category path, e.g. `Home > Lighting > Floor Lamps`. |
| `metaTitle` / `metaDescription` | 🟠 | Falls back to title/short description if absent. |

---

## 7. Reviews

**We do not have a reviews collection yet** — this defines what to collect so it
can be built. Three of Baymard's top-10 product page gaps are review-related.

| Field | Tier | Notes |
|---|---|---|
| `rating` | 🔴 | 1–5 integer |
| `title` | 🟠 | Short summary |
| `body` | 🔴 | The review text |
| `authorName` | 🔴 | Display name |
| `verifiedPurchase` | 🟠 | Materially changes how much trust a review earns |
| `createdAt` | 🔴 | Recency is a trust signal; a wall of 2-year-old reviews reads as abandoned |
| **`images`** | 🟠 | Customer photos. **63% of sites don't let users browse photos across reviews.** Buyers treat customer images as objective evidence in a way they never treat ours. |
| `variantPurchased` | 🟡 | "Which size did they buy?" |
| `merchantResponse` | 🟠 | **89% of sites ignore negative reviews.** A visible reply to a critical review measurably improves confidence — including for the people reading the complaint. |
| `helpfulCount` | 🟡 | Sorting signal |

**If migrating reviews from another platform**, preserve original timestamps and
verified status. Re-dating imported reviews to the import date destroys the
recency signal.

---

## 8. Dropship / supplier

Only for `fulfilment: dropship`. See `CLAUDE.md` §4b.

| Field | Tier | Notes |
|---|---|---|
| `supplier` | 🔴 | Link to the Suppliers collection |
| `supplierSku` | 🔴 | Their identifier, used to route the purchase order |
| `supplierCost` | 🟠 | Integer cents. Margin reporting. |
| `leadTimeDays` | 🔴 | Dispatch time. **Understating it causes Merchant Center policy problems** and angry customers. |
| `supplierStockUrl` | 🟡 | Feed URL for automated stock sync |

⚠️ **`fulfilment: affiliate` products are permanently excluded from Google
Shopping** — Google forbids promoting affiliate links. See
`docs/decisions/2026-07-27-affiliate-products-merchant-center.md`.

---

## 9. Bulk import template

Minimum viable columns for a first import:

```csv
sku,title,brand,gtin,mpn,condition,price,currency,inventory,weight,
shortDescription,description,googleProductCategory,image1,image2,image3,
variantType,variantValue,fulfilment,supplierSku,leadTimeDays
```

**Validation before import** — these are the ones that actually bite:

1. `sku` unique
2. `price` is an integer in **cents**, not a decimal
3. `gtin` is 8/12/13/14 digits and passes its check digit
4. Primary image ≥1000×1000 with no text overlay
5. Every variant row has its own sku, price and inventory
6. `currency` matches the shop's configured currency
7. `slug` unique and URL-safe

---

## Priority if you cannot gather everything at once

1. **Identity + price + inventory + one clean primary image** — enough to sell.
2. **GTIN** — the single biggest reach multiplier in Shopping.
3. **Weight and dimensions** — required for honest shipping cost, which is the
   #1 abandonment cause.
4. **Additional + in-scale images** — the biggest on-page conversion lever.
5. **Specifications and key features** — answers the questions that otherwise
   become abandonment or a support ticket.
6. **Reviews** — compounding trust; start collecting from day one even if the
   feature ships later.
