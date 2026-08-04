import { Plane, Receipt, Timer } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { getCompany } from '@/utilities/getCompany'
import { getShippingDisclaimer, type DisclaimerFact } from '@/utilities/shippingDisclaimer'
import { cn } from '@/utilities/cn'

/**
 * Cross-border shipping and customs disclaimer.
 *
 * Renders **nothing at all** when switched off in Company settings — no empty
 * box, no orphan heading. One toggle removes it from every surface.
 *
 * Presented as three scannable facts rather than a paragraph. Prose beside a
 * buy button gets skipped; an icon row with "9–16 days to arrive" gets read.
 * That matters because unexpected delay and unexpected cost are the two largest
 * causes of checkout abandonment, and saying them before the customer commits
 * is what prevents the refund, the chargeback and the review.
 */

const ICONS: Record<DisclaimerFact['icon'], React.ElementType> = {
  origin: Plane,
  transit: Timer,
  customs: Receipt,
}

export const ShippingDisclaimer: React.FC<{
  className?: string
  /** `inline` for the buy box; `block` for policy pages. */
  variant?: 'inline' | 'block'
}> = async ({ className, variant = 'inline' }) => {
  const company = await getCompany()
  const disclaimer = getShippingDisclaimer(company)

  if (!disclaimer.enabled) return null

  // Policy pages already sit in a prose column, so a paragraph is the right
  // form there — a boxed panel mid-document reads as an advert.
  if (variant === 'block') {
    return (
      <div
        className={cn('border border-border bg-muted p-5', className)}
        style={{ borderRadius: 'var(--radius)' }}
      >
        <p className="mb-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          International delivery
        </p>
        <p className="text-sm leading-relaxed">{disclaimer.text}</p>
      </div>
    )
  }

  return (
    <section
      aria-label="International delivery"
      className={cn('border border-border bg-muted/60 p-5', className)}
      style={{ borderRadius: 'var(--radius)' }}
    >
      <ul className="flex flex-col gap-4">
        {disclaimer.facts.map((fact) => {
          const Icon = ICONS[fact.icon]

          return (
            <li className="flex items-start gap-3" key={fact.label}>
              <span
                aria-hidden
                className="mt-px flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-background"
                style={{ borderRadius: 'var(--radius)' }}
              >
                <Icon className="text-muted-foreground" size={14} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-snug text-foreground">{fact.label}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{fact.detail}</p>
              </div>
            </li>
          )
        })}
      </ul>

      <Link
        className="mt-4 inline-block border-t border-border pt-3 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        href="/shipping"
      >
        Full shipping &amp; delivery details
      </Link>
    </section>
  )
}
