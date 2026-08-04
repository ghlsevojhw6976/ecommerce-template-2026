# Premium positioning — direction decision (2026-07-28)

Context: kitchenware, electronics and outdoor products at **€400–1200**.
Universal template, but the product page must not look cheap.

Supersedes §8 of `2026-07-28-ui-plan.md`.

---

## 1. The direction: Editorial structure, technical detail

Neither pure option from the earlier plan fits.

- **Editorial alone** suits kitchenware and outdoor imagery, but leaves
  electronics buyers without the specs they need to compare.
- **Technical alone** serves electronics well but makes a €900 pan set look like
  a components catalogue.

At €400–1200 across mixed categories the buyer is doing **two things at once**:
falling for the object, and validating the decision. The page has to serve both,
in that order.

> **Editorial above the fold. Technical below it.**
>
> Generous space and large photography earn the emotional yes. Dense,
> precise specification earns the rational one. The transition between the two
> is the design.

This is how premium tool and gear brands actually look, and it is genuinely
universal: the same layout carries a stockpot, a headphone amp and a tent,
because the editorial half flexes with photography and the technical half flexes
with the spec table.

---

## 2. What makes a shop look cheap — and what to do instead

The brief was "must not look cheap", so this is worth being concrete about.
Perceived quality at this price point comes from a small number of decisions:

| Reads cheap | Reads premium | Why |
|---|---|---|
| Cramped, dense layout | **Generous whitespace** | Space is the oldest signal of confidence. Cheap sites fill every pixel because they are afraid you will leave. |
| Many colours, evenly used | **One dominant surface, accent used sparingly** | ~60/25/10/5 distribution. Five colours in equal measure is a swatch card. |
| Loud red `-40%` sale badges | **Quiet price treatment**, original struck through | Aggressive discounting signals commodity. At €900 it actively erodes trust. |
| Countdown timers, "12 people viewing!" | **Honest scarcity** — real stock counts, real delivery dates | Fake urgency is the single fastest way to look like a dropshipper. |
| Small images in a busy grid | **Large, consistent photography** | Consistent crop and background across a category matters more than any single image. |
| Geist / Inter / system fonts | **A real type pairing** | The default font is the tell. |
| Drop shadows and rounding everywhere | **A committed radius, restrained elevation** | Consistency reads as intent. |
| Stock photography | **Real product photography** | Non-negotiable at this price. |
| Motion on everything | **One well-timed moment** | Restraint is expensive-looking; jitter is not. |

None of these cost engineering time. They are token and layout decisions made
once and inherited by every shop.

---

## 3. What changes because of the price point

Research on high-ticket conversion says the constraint is **risk, not price**.
Buyers hesitate over: is it authentic, is it as described, can I get my money
back, and can a real person help me. The page has to answer all four.

### 3.1 Financing — the biggest single lever, and nearly free

This is the finding I would act on first:

- Klarna reports a **30–35% conversion lift** when BNPL is offered
- Stripe merchants offering BNPL see up to **+14% revenue**
- Affirm: **29% of users would not have completed the purchase** without it
- Typical **AOV lift of 10–30%**

At €400–1200, "€75/month" is a materially different decision from "€900".

**We already use Stripe, which supports Klarna and Affirm as payment methods** —
so this is largely configuration plus showing the monthly figure on the product
page, not a new integration. Highest ratio of impact to effort in this whole
plan.

### 3.2 Trust, in priority order

| Signal | Evidence |
|---|---|
| **Review count shown, not just stars** | +18% add-to-cart |
| **Real customer photos** | +35% product page conversion |
| Free/extended returns stated near the CTA | Turns an irreversible decision into a safe one |
| Warranty length, prominently | Standard expectation in electronics and outdoor |
| Real contact details — phone, address, named people | High-value buyers want to know a human exists |
| Certifications, press, awards | Signals you will still be around to honour the warranty |

Research suggests aiming for **20+ detailed reviews** per product for
"statistical confidence" — generic star averages do not carry a €900 decision.
This makes the Reviews collection a launch dependency, not a nice-to-have.

### 3.3 Longer consideration cycles

Nobody buys a €900 item on first visit. The template needs:

- **Save / wishlist without an account** (89% of sites get this wrong)
- Email capture with intent — back-in-stock, price drop
- Comparison between similar products
- A pre-purchase question route (contact, or chat later)
- Rich enough content to survive a second and third visit

---

## 4. Category handling in one template

| Category | Leans on | Template accommodates via |
|---|---|---|
| **Kitchenware** | Material, capacity, care, lifestyle imagery | Editorial hero, in-use photography, care block |
| **Electronics** | Specs, compatibility, warranty, comparison | Dense spec table, mono numerals, comparison |
| **Outdoor** | Durability, weather ratings, weight, scale | Scale imagery, condition/rating badges, weight prominence |

All three run through the same components; the spec table is data-driven, so a
product with 4 specs and one with 24 both look deliberate.

---

## 5. Typography

Editorial-technical pairing:

- **Display:** Fraunces — a variable serif with optical sizing. Carries premium
  weight without the fashion-house coldness that would be wrong for a stockpot.
- **Body:** Satoshi — geometric sans, clean at small sizes, not Inter.
- **Numerals/specs:** a tabular mono for prices, dimensions, SKUs and spec
  tables. **Tabular figures matter** — prices in a grid should align on the
  decimal, and mono digits in a spec table are the detail that reads engineered.

All variable, all free for commercial use — which matters for a template
deployed to many shops. Licensing still gets checked per deployment.

---

## 6. Revised phasing

| Phase | Contents | Why here |
|---|---|---|
| **1. Design foundation** | Tokens, Fraunces/Satoshi/mono, scale, radius, density, motion primitives | Everything inherits this |
| **2. Product page** | Editorial hero → technical detail, trust block, financing display, spec table, reviews slot | Highest impact, and the thing that must not look cheap |
| **3. Palette engine** | Coolors parsing, OKLCH roles, contrast enforcement, admin preview | Makes it reusable across shops |
| **4. Header + navigation** | Category mega-menu, search, announcement bar | Categories were explicitly asked for |
| **5. Homepage** | Composable blocks | |
| **6. PLP + filters** | Grid, filters, comparison | |
| **7. Policy pages** | Templated FAQ / returns / terms / contact, variable-injected per shop | Shared across shops |
| **8. Reviews collection** | Schema per `PRODUCT-DATA-REQUIREMENTS.md` §7 | Launch dependency at this price point |

Reordered from the previous plan: **product page moved ahead of the palette
engine**, because the brief is that it must stand out, and it is easier to judge
a palette against a real page than the reverse.

**Recommended alongside:** enable Klarna/Affirm in Stripe early, so the monthly
figure can be designed into the page rather than bolted on.

---

## 7. Still open

1. **Warranty and returns terms** — needed as real values, not placeholders. What
   is the returns window and standard warranty?
2. **Reviews** — confirm building the collection now.
3. **Currency** — still USD-only, and every price in this plan is a €. This
   should be settled before the product page is built.
4. **First shop's category** — for real photography and copy in the build.

---

## Sources

- [Average High-Ticket Ecommerce Conversion Rate 2026](https://www.fyresite.com/average-ecommerce-conversion-rate-for-high-ticket-sales/)
- [Luxury Ecommerce Trust: UX for High-Value Buyers](https://elogic.co/blog/luxury-ecommerce-trust/)
- [BNPL in 2026: When Buy-Now-Pay-Later Lifts Your AOV](https://www.digitalapplied.com/blog/bnpl-2026-buy-now-pay-later-ecommerce-decision-matrix)
- [Product Page Optimization: Conversion Guide 2026](https://www.digitalapplied.com/blog/product-page-optimization-ecommerce-conversion-guide-2026)
- [Product Page UX Best Practices 2026 — Baymard](https://baymard.com/blog/current-state-ecommerce-product-page-ux)
