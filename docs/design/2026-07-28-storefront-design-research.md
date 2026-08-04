# Storefront design — research & plan (2026-07-28)

Goal: a palette chosen from [coolors.co/palettes/trending](https://coolors.co/palettes/trending)
drives the entire shop, and the homepage and product pages are built to current
conversion research rather than taste alone.

**Status: proposal. Nothing implemented yet.**

---

## 1. Where we actually are

Audited the template as it stands:

| Area | State |
|---|---|
| Design tokens | shadcn-style **OKLCH** custom properties already in `globals.css` (`--primary`, `--background`, `--card`, `--muted`, `--border`, …) |
| Palette | Neutral greys. No brand identity whatsoever. |
| Homepage | **Does not exist.** `app/(app)/page.tsx` re-exports the generic CMS page template — the homepage is just a CMS page. |
| Product page | Two columns (gallery \| description) + related products. Functional, plain. |
| PDP components | `Gallery`, `ProductDescription`, `VariantSelector`, `StockIndicator` |
| Dark mode | Wired via `[data-theme='dark']` |
| Reviews | **No collection exists** |

Two things make this cheaper than it looks:

1. The OKLCH token layer is already the integration point. Override those
   variables and every existing component re-themes for free — no component
   rewrites needed for the palette feature.
2. OKLCH is perceptually uniform, so deriving tints, shades and *contrast-safe*
   pairings is arithmetic rather than guesswork. In hex or HSL this would be a
   mess.

---

## 2. The palette problem — why 5 hex codes are not a design system

This is the part worth getting right, and the naive version fails badly.

A trending coolors palette is five arbitrary colours chosen to look good **as a
row of swatches**. A shop needs something different: a system of surfaces,
text, borders and states that stays legible in every combination. Four specific
failure modes:

**a. No guaranteed contrast.** Trending palettes are frequently all mid-lightness
— five colours that harmonise beautifully and offer no near-white surface and no
near-black text. Applied literally you get grey-on-beige body copy at 2.1:1 and
an unreadable shop. WCAG AA needs **4.5:1** for body text and **3:1** for UI
boundaries.

**b. Palette order is meaningless.** Nothing says the first swatch should be
"primary". Role assignment has to be derived from the colours themselves —
sort by OKLCH lightness and chroma — not from their position in the URL.

**c. Semantic collision.** Ecommerce needs colours that carry fixed meaning:
in-stock green, error red, sale red. If the palette's accent is a warm red, then
"Sale" and "Error" become the same colour and the interface starts lying. These
must stay outside the brand ramp — harmonised in hue, but never merged.

**d. Dark mode is not an inversion.** Flipping lightness produces muddy,
over-saturated results. Dark surfaces need chroma reduced and lightness
recomputed independently.

### The approach

```
coolors URL
  → parse hex (verified: the hexes are literally in the URL, 5 colours)
  → convert to OKLCH
  → assign semantic roles by lightness/chroma, not by position
  → derive a 50–950 ramp per role
  → ENFORCE contrast: for every surface, compute the foreground that passes AA;
    if the brand colour cannot pass, adjust its lightness until it does and
    report the adjustment rather than shipping something unreadable
  → generate light + dark sets independently
  → write CSS custom properties (the tokens that already exist)
```

The non-negotiable bit is the enforcement step. The admin should be able to
paste any trending palette and get a shop that is *always* legible — with an
honest report saying "your accent was darkened 12% to pass contrast on buttons".
A preview that let someone ship 2.1:1 body text would be worse than no feature.

**Verified:** `https://coolors.co/palette/264653-2a9d8f-e9c46a-f4a261-e76f51`
returns 200 and parses to 5 hex codes with a one-line split. No scraping, no API
key, no dependency.

---

## 3. Conversion research

Sources at the bottom. Numbers chosen because they change what we build.

### Checkout — the biggest single lever

- Average cart abandonment: **70.22%** (across 50 studies)
- Of shoppers who intended to buy: **39% abandon over unexpected costs at
  checkout**, **24% over forced account creation**
- **22%** abandon because checkout is too long or complicated
- Average US checkout: **23.48 form fields** — Baymard's optimum is **12–14**
- Better checkout design is worth up to a **35.26%** conversion increase

The two biggest causes are both design decisions we control, and the current
checkout has never been reviewed against them.

### Product pages — most sites are mediocre

Only **48% of desktop** and **38% of mobile** sites reach "decent or good" PDP
UX. Baymard's current top-10, with the share of sites failing each:

| Practice | Sites failing | Notes for us |
|---|---|---|
| Buttons for variant selection, not dropdowns | 57% | We have `VariantSelector` — needs auditing |
| "In scale" images | 37% | **42% of users** try to judge size from images |
| Human model images | 23% | Photography, not code |
| Guest "save for later" | 89% | Needs a wishlist; no account required |
| Price per unit | 81% | Needs a unit/size field on products |
| **Total cost estimate near the buy button** | 67% | Directly attacks the 39% surprise-cost abandonment |
| Return policy linked on the PDP | 44% | **60%** look for it there; **15%** abandon without it |
| Gifting options | 78% | Probably out of scope |
| Responses to negative reviews | 89% | Needs reviews first |
| Browse images across reviews | 63% | Needs reviews first |

### Performance is a conversion feature

- **INP is the most-failed Core Web Vital** — 43% of sites miss the 200ms bar
- 1s slower ≈ **7% fewer conversions**; 0.1s faster on mobile ≈ **+8.4%** retail conversion
- Passing all three CWV correlates with **24% lower bounce**
- PDPs and category pages are typically the *worst* offenders, because galleries,
  reviews, variant logic and recommendations all compete for the main thread

This constrains the design: server components by default, one LCP image
preloaded, no carousel library on the critical path, no layout shift from
lazily-arriving price or stock components.

---

## 4. Proposed architecture

### 4.1 Theme engine

`src/lib/theme/` — pure, testable, no React:

| Module | Responsibility |
|---|---|
| `parsePalette.ts` | coolors URL or raw hex list → validated colours |
| `oklch.ts` | hex ↔ OKLCH, contrast ratio, lightness adjustment |
| `assignRoles.ts` | palette → semantic roles by lightness/chroma |
| `deriveScale.ts` | role → 50–950 ramp |
| `enforceContrast.ts` | guarantee AA; report every adjustment |
| `emitTokens.ts` | roles → CSS custom properties, light + dark |

Pure functions mean the contrast guarantees are unit-testable without a browser —
the same approach that caught the micros and `numeric`-as-string bugs earlier.

### 4.2 Admin surface

`Settings → Brand & Theme` (Payload global):

- Paste a coolors URL, or enter hex values directly
- Live swatch preview with **computed contrast ratios and pass/fail per pairing**
- Role overrides for when the automatic assignment is not what you wanted
- Radius / density / font pairing controls
- Tokens written to the database and injected as a `<style>` block in the root
  layout, so a palette change is instant and needs no redeploy

### 4.3 Storefront work

**Homepage** — build a real one instead of a CMS passthrough: hero with a single
clear value proposition, category entry points, featured products, trust row
(returns, delivery, payment), social proof. Composed of Payload blocks so
marketing can reorder without a deploy.

**PDP** — restructure around the Baymard findings: gallery with scale cues,
button-based variants with availability visible on the button, price with unit
price where applicable, **delivery estimate and total cost near the buy button**,
returns link, stock urgency, trust row, reviews slot.

**PLP / category** — grid, filters, sort, pagination.

**Cart & checkout** — audit against the 12–14 field optimum, guarantee guest
checkout is the prominent path, and show all costs before the final step.

---

## 5. Honest scope boundaries

Some Baymard recommendations need **data or content we do not have**. Code can
build the slot; it cannot invent the input:

| Needs | Blocked on |
|---|---|
| Reviews, review photos, responses to negative reviews | A `Reviews` collection — does not exist. Meaningful build in itself. |
| Price per unit | Unit/size/weight fields on products |
| In-scale and human model images | Photography |
| Return policy link | The policy itself |
| Gifting | Probably not worth it now |

My recommendation: build the **slots** for reviews and unit pricing so the layout
is correct, and treat the `Reviews` collection as a separate piece of work rather
than smuggling it in here.

---

## 6. Proposed phasing

| Phase | Contents | Rough size |
|---|---|---|
| **1. Theme engine** | Parser, OKLCH maths, role assignment, contrast enforcement + tests | Foundation — everything depends on it |
| **2. Brand admin** | Global, live preview, contrast report, token injection | Makes the palette switchable |
| **3. Product page** | Restructure against Baymard | Highest conversion impact |
| **4. Homepage** | Real homepage as composable blocks | Highest first-impression impact |
| **5. PLP + navigation** | Grid, filters, sort | |
| **6. Cart & checkout audit** | Field count, guest path, cost transparency | Biggest single lever, but touches paid flows — deliberately last, after the Stripe work has settled |

Phases 1–2 are the "choose a palette" feature. Phases 3–6 are the "slick shop".
They are independent — either can go first.

---

## 7. Open questions

1. **Palette control** — fully automatic role assignment, or manual override of
   which swatch becomes primary/accent?
2. **Aesthetic direction** — trending palettes suit very different treatments
   (editorial//minimal, bold/brutalist, warm/organic). Layout and type should
   follow the intended feel, and this is the one thing research cannot decide.
3. **Reviews** — build the collection now, or slot only?
4. **Dark mode** — ship it, or light-only for launch?
5. **Phase order** — product page first (conversion) or homepage first (impression)?
6. **Currency** — still USD-only from the last round. Prices are the most visible
   thing on every page in scope, so this is worth settling before building them.

---

## Sources

- [Product Page UX Best Practices 2026 — Baymard](https://baymard.com/blog/current-state-ecommerce-product-page-ux)
- [Cart Abandonment Rate Statistics — Baymard](https://baymard.com/lists/cart-abandonment-rate)
- [Checkout Conversion Statistics 2026](https://www.shno.co/marketing-statistics/checkout-conversion-statistics)
- [Core Web Vitals 2026: INP, LCP & CLS](https://www.digitalapplied.com/blog/core-web-vitals-2026-inp-lcp-cls-optimization-guide)
- [Core Web Vitals for E-commerce](https://www.w3era.com/blog/seo/core-web-vitals-ecommerce-fix/)
- [Ecommerce Homepage Design Best Practices](https://decodeup.com/blog/ecommerce-homepage-design-best-practices)
- [Coolors trending palettes](https://coolors.co/palettes/trending)
