import React from 'react'

import type { Product } from '@/payload-types'

/**
 * The technical half of the page.
 *
 * Editorial above the fold earns the emotional yes; this earns the rational
 * one. Electronics buyers compare on it, kitchenware buyers check materials and
 * capacity, outdoor buyers check weight and ratings — one component, because
 * the data is uniform even when the subject is not.
 *
 * Values render in tabular figures so a column of numbers aligns on the
 * decimal. That alignment is the small detail that reads engineered rather than
 * assembled, and it costs one CSS class.
 *
 * Every section self-hides when empty, so a product with four specs and one
 * with twenty-four both look deliberate.
 */

type Spec = NonNullable<Product['specifications']>[number]

const groupSpecs = (specs: Spec[]): { group: string | null; rows: Spec[] }[] => {
  const groups: { group: string | null; rows: Spec[] }[] = []

  for (const spec of specs) {
    const key = spec.group?.trim() || null
    const existing = groups.find((g) => g.group === key)
    if (existing) existing.rows.push(spec)
    else groups.push({ group: key, rows: [spec] })
  }

  return groups
}

/**
 * 40tag is not an authorized retailer for the brands it sells and cannot
 * promise their manufacturer warranties will be honored — every warranty/
 * guarantee claim on the site references the single 40tag Guarantee
 * instead (src/lib/commerce/guarantee.ts, surfaced in Reassurance.tsx).
 * A manufacturer warranty term must never reach this table, however it got
 * into the data — the import script excludes it at the source
 * (src/lib/import/mapRow.ts) but this filter is the last line of defence
 * regardless of how a row got here. Owner decision 2026-08-12.
 */
const isWarrantyRow = (label?: string | null): boolean => Boolean(label && /warrant/i.test(label))

export const Specifications: React.FC<{ product: Product }> = ({ product }) => {
  const specs = (product.specifications ?? []).filter(
    (s) => s?.label && s?.value && !isWarrantyRow(s.label),
  )
  const features = (product.keyFeatures ?? []).filter((f) => f?.feature && !isWarrantyRow(f.feature))
  const boxContents = (product.inTheBox ?? []).filter((i) => i?.item)
  const care = product.careInstructions?.trim()

  // Identifiers rendered as a visible spec group, mirroring the Product
  // JSON-LD (brand/mpn/gtin) — the exact-model confirmation a comparison
  // shopper looks for, and a quotable line for answer engines. Same data as
  // the schema and the Merchant feed, so the three can never disagree.
  const identifiers: { label: string; value: string }[] = [
    ...(product.brand?.trim() ? [{ label: 'Brand', value: product.brand.trim() }] : []),
    ...(product.mpn?.trim() ? [{ label: 'Model number', value: product.mpn.trim() }] : []),
    ...(product.gtin?.trim() ? [{ label: 'UPC / GTIN', value: product.gtin.trim() }] : []),
  ]

  // Nothing to say — say nothing.
  if (!specs.length && !features.length && !boxContents.length && !care && !identifiers.length)
    return null

  const grouped = groupSpecs(specs)

  return (
    <section
      aria-labelledby="product-details-heading"
      className="border-t border-border py-[var(--space-section)]"
    >
      <div className="container">
        <h2
          className="mb-[var(--space-block)] text-2xl md:text-3xl"
          id="product-details-heading"
        >
          Details
        </h2>

        <div className="grid gap-x-16 gap-y-12 lg:grid-cols-2">
          {/* ---- Features + box + care ---- */}
          <div className="flex flex-col gap-10">
            {features.length > 0 && (
              <div>
                <h3 className="mb-4 font-sans text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Key features
                </h3>
                <ul className="flex flex-col gap-3">
                  {features.map((f, i) => (
                    <li className="flex gap-3" key={i}>
                      <span
                        aria-hidden
                        className="numeric mt-0.5 shrink-0 text-2xs text-muted-foreground"
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <p className="text-base leading-snug text-foreground">{f.feature}</p>
                        {f.detail && (
                          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                            {f.detail}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {boxContents.length > 0 && (
              <div>
                <h3 className="mb-4 font-sans text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  In the box
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {boxContents.map((item, i) => (
                    <li className="text-sm text-foreground" key={i}>
                      {item.item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {care && (
              <div>
                <h3 className="mb-4 font-sans text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Care
                </h3>
                <p className="prose-measure text-sm leading-relaxed text-muted-foreground">
                  {care}
                </p>
              </div>
            )}
          </div>

          {/* ---- Specification table ---- */}
          {(grouped.length > 0 || identifiers.length > 0) && (
            <div className="flex flex-col gap-8">
              {grouped.map(({ group, rows }, gi) => (
                <div key={gi}>
                  {group && (
                    <h3 className="mb-4 font-sans text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {group}
                    </h3>
                  )}
                  <dl className="divide-y divide-border border-y border-border">
                    {rows.map((row, i) => (
                      <div className="flex items-baseline justify-between gap-6 py-3" key={i}>
                        <dt className="text-sm text-muted-foreground">{row.label}</dt>
                        <dd className="numeric text-right text-sm text-foreground">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}

              {identifiers.length > 0 && (
                <div>
                  <h3 className="mb-4 font-sans text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Product identifiers
                  </h3>
                  <dl className="divide-y divide-border border-y border-border">
                    {identifiers.map((row) => (
                      <div
                        className="flex items-baseline justify-between gap-6 py-3"
                        key={row.label}
                      >
                        <dt className="text-sm text-muted-foreground">{row.label}</dt>
                        <dd className="numeric text-right text-sm text-foreground">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
