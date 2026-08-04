'use client'
import type { Product } from '@/payload-types'

import { AddToCart } from '@/components/Cart/AddToCart'
import { Price } from '@/components/Price'
import { getDiscount } from '@/lib/commerce/discount'
import { useCurrency } from '@payloadcms/plugin-ecommerce/client/react'
import { ArrowUpRight } from 'lucide-react'
import React, { Suspense } from 'react'

import { Rating } from './Rating'
import { Reassurance } from './Reassurance'
import { StockIndicator } from '@/components/product/StockIndicator'

/**
 * The buy box — the editorial half of the product page.
 *
 * Order is deliberate and follows the sequence a considered buyer actually
 * moves through: what is it → do others trust it → what does it cost → which
 * one → is it available → buy → what if it goes wrong.
 *
 * The full description deliberately does NOT live here any more. At €400–1200
 * the buy box has one job: get to a confident "add to cart". Long-form copy
 * pushes the button below the fold, and the detail belongs in the technical
 * section further down the page where the buyer goes to validate.
 */

/**
 * "$0.74 per 100ml" — 81% of sites omit unit pricing entirely.
 *
 * Returns null unless the result actually tells the buyer something. A pan
 * priced "per 1 pan" is noise that restates the price directly above it, and
 * noise next to a $749 figure reads careless.
 */
const unitPrice = (
  amount: number,
  measure?: string | null,
  base?: string | null,
): string | null => {
  if (!measure || !base || !amount) return null

  // Identical measure and base means the unit IS the product — nothing to say.
  if (measure.trim().toLowerCase() === base.trim().toLowerCase()) return null

  const measureQty = parseFloat(measure)
  const baseQty = parseFloat(base)
  if (!Number.isFinite(measureQty) || !Number.isFinite(baseQty) || measureQty <= 0) return null

  // A single-unit product priced per single unit is the same restatement.
  if (measureQty === 1 && baseQty === 1) return null

  const perBase = (amount / 100 / measureQty) * baseQty
  if (!Number.isFinite(perBase)) return null

  return `$${perBase.toFixed(2)} per ${base}`
}

export function ProductDescription({
  product,
  shippingDisclaimer,
  familySelector,
  pooledRating,
}: {
  product: Product
  /** Server-rendered slot — the disclaimer reads Company settings, and this
      component is a client component. */
  shippingDisclaimer?: React.ReactNode
  /** Server-rendered slot — the colour/size sibling navigator. Selecting an
      option NAVIGATES to the sibling product's page. */
  familySelector?: React.ReactNode
  /** Ratings pooled across the product family (Baymard: 31+9 must read 40). */
  pooledRating?: { average: number | null; count: number }
}) {
  const { currency } = useCurrency()
  // Every product owns exactly one price now — colour/size siblings are
  // separate products, so price ranges no longer exist on a single page.
  const priceField = `priceIn${currency.code}` as keyof Product
  const amount = typeof product[priceField] === 'number' ? (product[priceField] as number) : 0

  const perUnit = unitPrice(
    amount,
    product.unitPricingMeasure,
    product.unitPricingBaseMeasure,
  )

  const isAffiliate = product.fulfilment === 'affiliate'

  const discount = getDiscount(product)
  const saleEndsLabel =
    discount?.saleEndsAt && Date.parse(discount.saleEndsAt) > Date.now()
      ? new Date(discount.saleEndsAt).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
        })
      : null

  return (
    <div className="flex flex-col">
      {/* ---- Identity ------------------------------------------------- */}
      {product.brand && (
        <p className="mb-3 font-sans text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {product.brand}
        </p>
      )}

      <h1 className="text-3xl leading-[1.1] md:text-4xl">{product.title}</h1>

      {/* Self-hides when the product has no reviews. Pooled across the
          family, so every sibling shows the same combined figure. */}
      <Rating
        average={pooledRating ? pooledRating.average : product.ratingAverage}
        className="mt-4"
        count={pooledRating ? pooledRating.count : product.ratingCount}
      />

      {product.shortDescription && (
        <p className="prose-measure mt-5 text-base leading-relaxed text-muted-foreground">
          {product.shortDescription}
        </p>
      )}

      {/* ---- Price ------------------------------------------------------
          Display face at a generous size. On sale: charged price keeps the
          weight, was-price struck in muted beside it, one quiet savings line
          under it — restrained, not clearance-bin. The end date is shown only
          when set: honest urgency or none at all. */}
      <div className="mt-8 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="font-display text-3xl tracking-tight">
          <Price amount={amount} compareAtAmount={discount?.compareAt} />
        </div>
        {perUnit && <span className="numeric text-xs text-muted-foreground">{perUnit}</span>}
      </div>
      {discount && (
        <p className="mt-2 text-sm text-muted-foreground">
          {discount.savingsLine}
          {saleEndsLabel && <> · Sale ends {saleEndsLabel}</>}
        </p>
      )}

      {/* ---- Choose ------------------------------------------------------
          Colour/size options navigate to the sibling product's own page. */}
      {familySelector && <div className="mt-8">{familySelector}</div>}

      {/* ---- Availability ---------------------------------------------- */}
      {!isAffiliate && (
        <div className="mt-6">
          <Suspense fallback={null}>
            <StockIndicator product={product} />
          </Suspense>
        </div>
      )}

      {/* ---- Buy --------------------------------------------------------
          Affiliate products check out on the PARTNER's site: an outbound
          link, never a cart button — there is no stock here to sell. The
          rel="sponsored nofollow" is Google-mandatory for paid/affiliate
          links regardless of any disclosure decision. */}
      <div className="mt-6">
        {isAffiliate ? (
          product.affiliateUrl ? (
            <a
              className="inline-flex h-12 w-full items-center justify-center gap-2 bg-primary px-8 text-base tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
              href={product.affiliateUrl}
              rel="sponsored nofollow noopener"
              target="_blank"
            >
              View at partner
              <ArrowUpRight aria-hidden size={16} strokeWidth={2} />
            </a>
          ) : null
        ) : (
          <Suspense fallback={null}>
            <AddToCart product={product} />
          </Suspense>
        )}
      </div>

      {/* ---- Reassurance ------------------------------------------------ */}
      <div className="mt-8">
        <Reassurance product={product} />
      </div>

      {/* Cross-border delivery and customs, before the customer commits.
          Renders nothing when switched off in Company settings. */}
      {shippingDisclaimer && <div className="mt-6">{shippingDisclaimer}</div>}
    </div>
  )
}
