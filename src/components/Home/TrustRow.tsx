import { PackageCheck, RotateCcw, ShieldCheck, Truck } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { getCompany } from '@/utilities/getCompany'
import { GUARANTEE_MONTHS, GUARANTEE_TAGLINE } from '@/lib/commerce/guarantee'

/**
 * Trust row.
 *
 * Same job as the reassurance block on the product page, moved to the point
 * where a first-time visitor is deciding whether this shop is real. At
 * €400–1200 the blocker is risk rather than price.
 *
 * Values come from Company settings, so this can never contradict the
 * announcement bar, the product page or the returns policy — EXCEPT the
 * guarantee line, deliberately static and imported from the same shared
 * constant as the product page's reassurance block (not Company settings):
 * 40tag is not an authorized retailer for the brands it sells, so it cannot
 * promise their manufacturer warranties will be honored, and this row must
 * never vary or imply otherwise.
 *
 * Text and thin icons, no badge graphics: fake-looking trust seals undermine
 * exactly the thing they are meant to establish.
 */
export const TrustRow: React.FC = async () => {
  const company = await getCompany()

  const threshold = company.freeShippingThreshold
  const fee = company.flatShippingFee
  const returnDays = company.returnWindowDays ?? 30
  const processing = company.processingTimeDays ?? 2

  const shippingTitle =
    typeof threshold === 'number' && threshold > 0 && typeof fee === 'number' && fee > 0
      ? `Free shipping over $${(threshold / 100).toFixed(0)} / $${(fee / 100).toFixed(0)} flat rate under $${(threshold / 100).toFixed(0)}`
      : typeof threshold === 'number' && threshold > 0
        ? `Free shipping over $${(threshold / 100).toFixed(0)}`
        : 'Free shipping'

  const items = [
    {
      icon: Truck,
      title: shippingTitle,
      detail: `Dispatched in ${processing} business day${processing === 1 ? '' : 's'}`,
      href: '/shipping',
    },
    {
      icon: RotateCcw,
      title: `${returnDays}-day returns`,
      detail: 'No restocking fees',
      href: '/returns',
    },
    {
      icon: ShieldCheck,
      title: `${GUARANTEE_MONTHS}-Month Guarantee`,
      detail: GUARANTEE_TAGLINE,
      href: '/faq',
    },
    {
      icon: PackageCheck,
      title: 'Chosen, not listed',
      detail: 'Every item is one we would own',
      href: '/faq',
    },
  ].filter(Boolean) as {
    icon: React.ElementType
    title: string
    detail: string
    href: string
  }[]

  return (
    <section aria-label="Why buy here" className="border-y border-border bg-muted">
      <div className="container py-[var(--space-block)]">
        <ul className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ icon: Icon, title, detail, href }) => (
            <li key={title}>
              <Link className="group flex items-start gap-3" href={href}>
                <Icon
                  aria-hidden
                  className="mt-0.5 shrink-0 text-muted-foreground"
                  size={18}
                  strokeWidth={1.5}
                />
                <div>
                  <p className="text-sm leading-snug transition-colors group-hover:text-muted-foreground">
                    {title}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{detail}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
