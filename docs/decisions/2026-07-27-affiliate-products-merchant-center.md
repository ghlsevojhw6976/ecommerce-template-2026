# Affiliate products in Google Shopping — 2026-07-27

**Question:** can we advertise affiliate products (checkout happens on a third
party's domain) in Google Merchant Center alongside our direct products?

**Answer: no, not under a standard Merchant Center account.**

---

## The governing rule

Google's Free listings / Shopping ads policy:

> You're not allowed to use Shopping to promote **affiliate or pay-per-click
> links** to products, **except when participating as a Comparison Shopping
> Service (CSS)** in a CSS program country.

And the landing page requirement:

> The products that you promote in Shopping need to be **available for purchase
> through your online store**.

This is not a technicality that better feed engineering routes around. Two
separate enforcement mechanisms catch it:

- **Mismatched checkout URL domains** — a named disapproval reason, triggered
  when the product landing page domain differs from the checkout domain. This is
  exactly what an affiliate redirect does.
- **Misrepresentation** — an account-level policy. Enforcement here can suspend
  the whole account, taking the *direct* products down with it.

The asymmetry is what matters: the upside of feeding affiliate products is some
extra traffic; the downside is losing Shopping for the entire catalogue.

## Why the CSS exception doesn't rescue it

A CSS is the licensed form of exactly this business model, so it's worth being
precise about the bar. Requirements include:

- Comparison across **at least 50 distinct merchant domains**
- Each product page must show offers from **at least 2 different merchant domains**
- Business registration in a supported country
- Dynamic search, plus sorting/filtering by price and one other dimension
- **"You may not automatically redirect users to other domains"** — which rules
  out the redirect-to-partner-checkout flow directly

Two blockers for us:

1. A mixed direct/affiliate store of moderate scale is nowhere near 50 merchant
   domains, and a CSS cannot be *primarily* a store selling on its own domain —
   which we are.
2. **CSS is not yet live in every EU market.** Google lists several smaller
   EU countries under "soon available" (Bulgaria, Croatia, Cyprus, Estonia,
   Latvia, Liechtenstein, Luxembourg, Malta, Slovenia among them). Note that in CSS program
   countries, Shopping ads must run *through* a CSS — so this needs confirming
   for our target markets regardless of the affiliate question.

## What we do instead

**The feed carries direct products only.** Affiliate products live on the site
and earn organic/SEO traffic, but never enter the Merchant Center feed. This is
enforced in the data model, not by hand — see `feedEligible` below.

**The upgrade path is `dropship`.** Where a supplier relationship allows it,
convert an affiliate product into one we sell as merchant of record: customer
checks out on *our* domain via Stripe, supplier fulfils. Same commercial
arrangement, but the product becomes feed-eligible and Shopping-advertisable —
and reseller margin normally beats affiliate commission. **Every product moved
from `affiliate` to `dropship` is a product we can advertise.**

## Resulting catalogue model

Three modes, not two. This is the schema decision that follows from the policy:

| Mode | Checkout | Fulfilment | In Merchant Center feed |
|---|---|---|---|
| `direct` | our domain, Stripe | our stock | ✅ yes |
| `dropship` | our domain, Stripe | supplier ships | ✅ yes |
| `affiliate` | **external domain** | partner | ❌ **never** |

```ts
// Products collection
{
  slug, title, description, images,
  brand, gtin, mpn, condition,        // Merchant Center required attributes
  fulfilment: 'direct' | 'dropship' | 'affiliate',

  // shown when fulfilment !== 'affiliate'
  variants, price, inventory, stripePriceId, shippingProfile,

  // shown when fulfilment === 'affiliate'
  affiliateUrl, affiliateNetwork, commissionRate, lastPriceCheckedAt,

  // derived, never hand-set — the single guard on the feed
  feedEligible: fulfilment !== 'affiliate',
}
```

`feedEligible` is computed in a Payload `beforeChange` hook and the feed builder
filters on it. Making it derived rather than a manual checkbox means nobody can
accidentally tick an affiliate product into the feed and risk the account.

## Open follow-ups

- [ ] Confirm which countries we're targeting, then check CSS status per country
      — in CSS countries, Shopping ads must run through a CSS even for our
      direct products
- [ ] Affiliate product pages need `rel="sponsored"` on outbound links and
      visible disclosure (FTC / EU consumer law), independent of Google
- [ ] Decide whether affiliate products are `noindex` or SEO-targeted
- [ ] Review which affiliate partners could become `dropship` suppliers instead

## Sources

- [Free listings policies](https://support.google.com/merchants/answer/12073010)
- [Shopping ads policies](https://support.google.com/merchants/answer/6149970)
- [Mismatched checkout URL domains](https://support.google.com/merchants/answer/14994242)
- [Landing page requirements](https://support.google.com/merchants/answer/4752265)
- [CSS program requirements](https://support.google.com/css-center/answer/7524491)
- [About advertising with CSS](https://support.google.com/merchants/answer/12653197)
