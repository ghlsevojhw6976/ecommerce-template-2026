import Link from 'next/link'
import React from 'react'

import type { Company, Homepage, Product } from '@/payload-types'
import { companyName } from '@/utilities/getCompany'
import { HeroProductCard } from './HeroProductCard'

/**
 * Homepage hero.
 *
 * ── Universal by construction ───────────────────────────────────────────
 * Every string is settings-driven with a fallback, so the same component
 * serves a 40-product shop and a 400-product one, in any brand palette,
 * without edits. Nothing here is specific to one client.
 *
 * ── Why a split, not a banner ───────────────────────────────────────────
 * The previous version was type-only and left ~40% of the viewport empty,
 * which read as sparse rather than confident. A full-bleed stock image would
 * fix the emptiness and cost more than it returns: it becomes the LCP element
 * on the most important page, and stock photography is the fastest way to look
 * like every other store.
 *
 * A real product does both jobs. It fills the space with something that is
 * genuinely ours, and it answers "what do you sell and what does it cost"
 * above the fold — a brand statement alone leaves the visitor a click away from
 * anything purchasable.
 *
 * ── Degradation ─────────────────────────────────────────────────────────
 * With no product to feature the layout collapses to a single centred column
 * rather than leaving a hole. A new shop with an empty catalogue still gets a
 * deliberate-looking page.
 */
export const Hero: React.FC<{
  company: Partial<Company>
  homepage: Partial<Homepage>
  product?: Product | null
}> = ({ company, homepage, product }) => {
  const eyebrow = homepage.eyebrow?.trim() || companyName(company)
  const headline = homepage.headline?.trim() || company.tagline?.trim() || 'Made to be kept.'
  const subcopy = homepage.subcopy?.trim()

  const primaryLabel = homepage.primaryCtaLabel?.trim() || 'Shop all'
  const primaryHref = homepage.primaryCtaHref?.trim() || '/shop'
  const secondaryLabel = homepage.secondaryCtaLabel?.trim()
  const secondaryHref = homepage.secondaryCtaHref?.trim() || '/faq'

  const hasProduct = Boolean(product)

  return (
    <section className="border-b border-border">
      <div className="container py-[var(--space-section)] md:py-[var(--space-section-lg)]">
        <div
          className={
            hasProduct
              ? 'grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20'
              : 'mx-auto max-w-3xl text-center'
          }
        >
          {/* ---- Statement ---- */}
          <div>
            <p
              className="reveal mb-6 text-xs uppercase tracking-[0.18em] text-muted-foreground"
              style={{ animationDelay: '0ms' }}
            >
              {eyebrow}
            </p>

            {/* Balanced wrapping keeps a long headline from leaving one orphan
                word on the last line — the difference between typeset and typed. */}
            <h1
              className="reveal text-4xl leading-[1.05] text-balance md:text-5xl lg:text-6xl"
              style={{ animationDelay: '60ms' }}
            >
              {headline}
            </h1>

            {subcopy && (
              <p
                className={`reveal mt-6 text-base leading-relaxed text-muted-foreground md:text-lg ${
                  hasProduct ? 'prose-measure' : 'mx-auto max-w-xl'
                }`}
                style={{ animationDelay: '120ms' }}
              >
                {subcopy}
              </p>
            )}

            <div
              className={`reveal mt-10 flex flex-wrap gap-3 ${hasProduct ? '' : 'justify-center'}`}
              style={{ animationDelay: '180ms' }}
            >
              <Link
                className="inline-flex h-12 items-center bg-primary px-8 text-sm text-primary-foreground transition-all hover:-translate-y-px hover:shadow-[var(--elevation-overlay)]"
                href={primaryHref}
                style={{ borderRadius: 'var(--radius)' }}
              >
                {primaryLabel}
              </Link>

              {secondaryLabel && (
                <Link
                  className="inline-flex h-12 items-center border border-input px-8 text-sm transition-colors hover:bg-muted"
                  href={secondaryHref}
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  {secondaryLabel}
                </Link>
              )}
            </div>
          </div>

          {/* ---- Featured product ---- */}
          {product && (
            <div className="reveal" style={{ animationDelay: '240ms' }}>
              <HeroProductCard product={product} />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
