# Launch Assets

What each new shop needs before its homepage looks deliberate rather than
unfinished. Hand this to whoever is gathering brand assets and copy.

Product-level data is a separate document: `PRODUCT-DATA-REQUIREMENTS.md`.

Every dimension and threshold below is taken from the code, not estimated — if
a component changes, this document should change with it.

---

## The short version

A homepage looks finished when it has:

| | Minimum | Ideal |
|---|---|---|
| Logo | 1 file (light) | 2 files (light + dark) + square mark |
| Palette | 3 colours | 5 colours from coolors.co |
| Hero product | 1 published product with a good photo | curated deliberately |
| Featured products | **3** | 4 or 8 |
| Categories | 3 | **5** (best layout) or 6 |
| Category images | 0 — works without | all of them |
| Hero copy | nothing (falls back) | headline + subcopy + 2 CTAs |
| Company details | name | full address, phone, hours, registration |

**Nothing on this list is mandatory to render a page.** Everything degrades to a
sensible fallback. The list is what separates "technically working" from
"looks like a real shop".

---

## 1. Logo

Set in **Settings → Company → Logo**.

| Asset | Purpose | Spec |
|---|---|---|
| `logoLight` | Light backgrounds — usually the **dark** version of your mark | SVG preferred, or PNG ≥ 3× the render height |
| `logoDark` | Dark backgrounds | Same. Leave blank if you have no dark variant. |
| `logoMark` | Square icon for favicons and tight spaces | 512×512, square |
| `src/app/favicon.ico` | Fallback tab icon when no logoMark is set (also what browsers cache hardest) | multi-size ICO, 16/32/48 px |
| `ogImage` | Social sharing preview | 1200×630 |

Rendered height defaults to **28px** in the header, adjustable per shop. Supply
artwork that reads at that size — a detailed mark becomes mush. If the logo is a
wordmark, budget for a horizontal lockup rather than a stacked one.

**If missing:** falls back to a generic mark plus the company name set in the
display face. Legible and not embarrassing, but it does not look like a brand.

Both variants are rendered and swapped with CSS, so there is no flash when the
theme changes.

---

## 2. Palette

Set in **Settings → Brand & Theme**. Paste a URL from
[coolors.co/palettes/trending](https://coolors.co/palettes/trending) or a list of
hex codes.

- **3 colours minimum**, 5 is ideal
- Order does not matter — roles are assigned by lightness and chroma
- Contrast is enforced automatically; the admin reports anything it had to adjust

Also here: **radius** (sharp → soft) and **density** (compact → spacious). These
are how two shops sharing a palette end up looking like different businesses
rather than the same template recoloured. Worth setting deliberately per shop.

**If missing:** the default neutral theme. Functional, anonymous.

---

## 3. Hero

Set in **Settings → Homepage → Hero** and **→ Featured**.

### The hero product

**Yes — the hero uses a real product card, not a banner image.** It shows the
product's photo, brand, title, price and rating, and links straight to the
product page.

That is deliberate: a hero image is usually the LCP element on the most
important page, stock photography is the fastest way to look like every other
store, and a brand statement alone leaves the visitor a click away from anything
they can buy. A real product with a real price answers the question everyone is
silently asking.

| Requirement | Spec |
|---|---|
| Image aspect | **4:5 portrait** — it is cropped to this, so shoot or crop accordingly |
| Minimum size | 1200×1500 |
| Subject | Your best photograph. This is the first product anyone sees. |
| Price | Should be representative — not your cheapest item |

Pick a product whose photo works **cropped tall**. A wide product shot (a long
knife, a sheet pan) loses its subject at 4:5. Choose something that fills a
portrait frame: a pan, a kettle, a grinder.

**If missing:** the newest published product is used automatically. If there are
no products at all, the hero collapses to a centred single column — still
deliberate-looking, just without a product.

### Hero copy

| Field | Guidance |
|---|---|
| `eyebrow` | Under ~30 characters. Defaults to the company name. |
| `headline` | **6–10 words.** Set very large; a long headline stops being a headline. |
| `subcopy` | **Max 240 characters.** Say what makes the range worth buying, not what the category is. |
| `primaryCtaLabel` / `Href` | Defaults to "Shop all" → `/shop` |
| `secondaryCtaLabel` / `Href` | Optional — hidden entirely when blank |

Write the headline about the *promise*, not the product type. "Tools built to be
resurfaced, not replaced" works; "Quality kitchenware" does not.

**If missing:** falls back to the company tagline, then to a generic line. The
page renders, but every shop you launch says the same thing — so this is the
single highest-value copy on the site.

---

## 4. Featured products row

Set in **Settings → Homepage → Featured**, or left to fall back to newest.

| Count | Result |
|---|---|
| 0–2 | **Section hides entirely.** A lone card in a grid reads as broken. |
| 3 | 3-column row |
| 4 | 4-column row |
| 8 | 4 columns × 2 rows — the fullest it looks |

Rows are trimmed to whole rows, so the grid never ends mid-row. Curated
selection is capped at 8.

**Product images are square (1:1)** in this grid. Consistent crop and background
across the row matters more than any individual image — mixed backgrounds are
what make a grid look assembled rather than designed.

The hero product is automatically excluded so it never appears twice.

---

## 5. Category grid

Set in **Settings → Homepage → Featured → featuredCategories**, or falls back to
top-level categories in menu order.

| Count | Layout |
|---|---|
| 1–2 | 2 columns |
| 3, 6 | 3 columns, all equal |
| 4 | 4 columns |
| **5** | **Lead tile (double width) + 4 — the best-looking option** |
| 7+ | First 6 shown |

**Five is the target.** It produces the only layout with visual hierarchy rather
than a uniform grid.

| Tile | Aspect | Minimum size |
|---|---|---|
| Lead (5-category layout only) | **8:3 wide** | 1600×600 |
| Standard | **4:3** | 1200×900 |

Art direction matters more here than anywhere else on the page. These sit
adjacent at different sizes, so they need to feel like a set: same lighting,
same background treatment, same distance from subject. Six beautiful but
unrelated photographs look worse than six ordinary consistent ones.

**If missing:** tiles render as clean empty panels with the category name
beneath. The page is not broken, but this is the single biggest visual gap on a
new shop — it is roughly half the page's area. **Prioritise these over almost
any other asset.**

---

## 6. Company details

Set in **Settings → Company**. Feeds the header, footer, contact page, and every
policy page through `{{company.*}}` placeholders.

**Needed for the homepage and footer to read as a real business:**

- Trading name, and legal entity if different
- Full postal address
- Support email, phone, support hours
- Founded year (drives the copyright range)
- Company/registration number where applicable

**Needed for the announcement bar and trust row:**

- `returnWindowDays` (default 30)
- `freeShippingThreshold` in cents
- `defaultWarrantyMonths`
- `processingTimeDays`

These same values appear on the product page and in the returns policy, so they
only need to be right once — but they do need to be right, because they are a
promise you are making in four places at once.

**If missing:** the announcement bar hides, the trust row loses entries, and
policy pages show `{{company.phone}}` in place of the value. That last one is
deliberate — a visible gap gets fixed; a silently blank sentence does not.

---

## 7. Priority order

If assets are arriving piecemeal, this is the order that buys the most:

1. **Company details + palette** — five minutes, and the whole site stops looking generic
2. **Category images** — the largest visual gap on the homepage
3. **Hero product photography** (4:5) — the first thing anyone sees
4. **Hero headline and subcopy** — otherwise every shop you launch says the same thing
5. **Logo** — the fallback is acceptable for longer than you would think
6. **3+ products with square photography** — unlocks the featured row

---

## 8. Pre-launch check

- [ ] Homepage has a hero product with a portrait-friendly photo
- [ ] At least 3 published products, ideally 4 or 8
- [ ] 5 categories, each with an image, shot as a set
- [ ] Hero headline is specific to this shop, not the fallback
- [ ] Logo uploaded; dark variant if the shop offers dark mode
- [ ] Palette set and the contrast report is clean
- [ ] Returns window, warranty and shipping threshold set — check they match what the business will honour
- [ ] Policy pages seeded (`POST /next/policies/seed`) and reviewed
- [ ] Terms and Privacy reviewed by a lawyer
- [ ] No `{{company.*}}` placeholders visible on any page

## Stripe checkout page (per shop)

The payment page is Stripe-hosted (checkout.stripe.com) and shows what the
shop's **Stripe dashboard** is configured with — not this codebase. Per deploy:

1. **Business name** — Stripe Settings → Business details. This is the page
   title and "Pay <name>" heading the customer sees. (A sandbox default like
   "testing shop" WILL be shown to customers if left unset.)
2. **Checkout branding** — Stripe Settings → Branding → Checkout: logo/icon,
   background colour, button colour. Match the shop palette.
3. **Payment methods** — dashboard toggles (card, Apple Pay, Google Pay, Link,
   Affirm, Klarna…). No code changes; no Apple Pay domain registration is
   needed for the hosted page.
4. **Webhook endpoint** — add `https://<domain>/api/payments/stripe/webhooks`
   with the events listed in Admin → Settings → Stripe, and paste the signing
   secret into that page.
