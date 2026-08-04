import type { Footer as FooterType } from '@/payload-types'

import { BrandLogo } from '@/components/BrandLogo'
import { CompanyDetails } from '@/components/CompanyDetails'
import { CMSLink } from '@/components/Link'
import { ThemeSelector } from '@/providers/Theme/ThemeSelector'
import { companyName, copyrightLine, getCompany } from '@/utilities/getCompany'
import { getCachedGlobal } from '@/utilities/getGlobals'
import { getNavCategories } from '@/utilities/getNavCategories'
import Link from 'next/link'
import React from 'react'

/**
 * Site footer.
 *
 * Rebuilt from a flex row that pushed contact details to the far right with
 * `ml-auto`, leaving a dead gap across the middle and no structure at all. It
 * also used hardcoded `neutral-200/700`, so it ignored the shop's palette
 * entirely — the one element on every page that stayed grey no matter which
 * brand it was.
 *
 * Now a four-column grid on theme tokens: brand, shop, help, contact. Columns
 * self-hide when empty, so a shop with no categories yet does not render an
 * empty heading.
 *
 * The footer is also the last-chance navigation surface — people scroll here
 * specifically looking for returns, contact and policies, which is why those
 * get a column rather than a line of small print.
 */
const POLICY_LINKS: [string, string][] = [
  ['/shipping', 'Shipping & Delivery'],
  ['/returns', 'Returns & Refunds'],
  ['/faq', 'FAQ'],
  ['/contact', 'Contact'],
  ['/terms', 'Terms & Conditions'],
  ['/privacy', 'Privacy Policy'],
]

export async function Footer() {
  const [footer, company, categories] = await Promise.all([
    getCachedGlobal('footer', 1)() as Promise<FooterType>,
    getCompany(),
    getNavCategories(),
  ])

  const menu = footer?.navItems || []
  const currentYear = new Date().getFullYear()
  const shopLinks = categories.slice(0, 6)

  return (
    <footer className="mt-[var(--space-section)] border-t border-border">
      <div className="container py-[var(--space-block)]">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:gap-8">
          {/* ---- Brand ---- */}
          <div>
            <Link className="inline-flex items-center" href="/">
              <BrandLogo />
              <span className="sr-only">{companyName(company)}</span>
            </Link>

            {company.tagline && (
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                {company.tagline}
              </p>
            )}

            {Boolean(company.socialLinks?.length) && (
              <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
                {company.socialLinks!.map((social) => (
                  <li key={social.id ?? social.url}>
                    <a
                      className="text-xs uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
                      href={social.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {social.platform}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ---- Shop ---- */}
          {shopLinks.length > 0 && (
            <nav aria-label="Shop">
              <h2 className="mb-4 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Shop
              </h2>
              <ul className="flex flex-col gap-2.5">
                {shopLinks.map((category) => (
                  <li key={category.id}>
                    <Link
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      href={`/shop/${category.slug}`}
                    >
                      {category.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* ---- Help ---- */}
          <nav aria-label="Help">
            <h2 className="mb-4 text-xs uppercase tracking-[0.12em] text-muted-foreground">Help</h2>
            <ul className="flex flex-col gap-2.5">
              {POLICY_LINKS.map(([href, label]) => (
                <li key={href}>
                  <Link
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    href={href}
                  >
                    {label}
                  </Link>
                </li>
              ))}

              {/* Editorial pages added in the CMS sit alongside the policies. */}
              {menu.map((item) => (
                <li key={item.id}>
                  <CMSLink
                    {...item.link}
                    appearance="link"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    size="clear"
                  />
                </li>
              ))}
            </ul>
          </nav>

          {/* ---- Contact ---- */}
          <div>
            <h2 className="mb-4 text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Contact
            </h2>
            <CompanyDetails variant="full" />
          </div>
        </div>
      </div>

      {/* ---- Bottom bar ---- */}
      <div className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-3 py-5 text-xs text-muted-foreground md:flex-row">
          <p className="text-center md:text-left">
            {copyrightLine(company, currentYear)}. All rights reserved.
            {company.companyNumber && (
              <span className="ml-3">Company no. {company.companyNumber}</span>
            )}
          </p>
          <ThemeSelector />
        </div>
      </div>
    </footer>
  )
}
