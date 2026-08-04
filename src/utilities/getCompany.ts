import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Company } from '@/payload-types'

/**
 * Company settings, memoised per request.
 *
 * The header, footer and every policy page need this, so without `cache` a
 * single page render would issue the same query four or five times.
 *
 * Never throws: a shop whose company record is missing should still render with
 * sensible fallbacks rather than 500. An empty header is recoverable; a dead
 * storefront is not.
 */
export const getCompany = cache(async (): Promise<Partial<Company>> => {
  try {
    const payload = await getPayload({ config: configPromise })
    const company = await payload.findGlobal({ slug: 'company', depth: 1 })
    return (company ?? {}) as Partial<Company>
  } catch {
    return {}
  }
})

/** Trading name, with a fallback so nothing ever renders "undefined". */
export const companyName = (company: Partial<Company>): string =>
  company.name?.trim() || 'Your Shop'

/** Registered entity where one is set, otherwise the trading name. */
export const companyLegalName = (company: Partial<Company>): string =>
  company.legalName?.trim() || companyName(company)

/** Single-line postal address, skipping whatever is blank. */
export const companyAddressLine = (company: Partial<Company>): string =>
  [
    company.addressLine1,
    company.addressLine2,
    company.city,
    company.region,
    company.postalCode,
    company.country,
  ]
    .map((part) => part?.toString().trim())
    .filter(Boolean)
    .join(', ')

/** Multi-line address for contact pages and invoices. */
export const companyAddressLines = (company: Partial<Company>): string[] =>
  [
    company.addressLine1,
    company.addressLine2,
    [company.city, company.region].filter(Boolean).join(', '),
    company.postalCode,
    company.country,
  ]
    .map((part) => part?.toString().trim())
    .filter((part): part is string => Boolean(part))

/**
 * Where returns physically go — often NOT the trading address.
 *
 * A shop dispatching from Europe into the US normally wants a domestic returns
 * address: an international return costs enough to deter the purchase in the
 * first place, and 15% of shoppers abandon over an unsatisfactory return
 * policy.
 *
 * Falls back to the trading address, so a shop that has not configured one
 * still prints something valid rather than a blank.
 */
export const returnsAddressLines = (company: Partial<Company>): string[] => {
  const separate = company.returnsAddressSameAsAbove === false ? company.returnsLocation : null

  if (separate) {
    const lines = [
      separate.recipient,
      separate.addressLine1,
      separate.addressLine2,
      [separate.city, separate.region].filter(Boolean).join(', '),
      separate.postalCode,
      separate.country,
    ]
      .map((part) => part?.toString().trim())
      .filter((part): part is string => Boolean(part))

    // Only use it once it is actually addressable — a half-filled block is
    // worse than falling back, because the parcel goes nowhere.
    if (separate.addressLine1?.trim() && separate.city?.trim()) return lines
  }

  return companyAddressLines(company)
}

/** Single-line form, for inline use in policy copy. */
export const returnsAddress = (company: Partial<Company>): string =>
  returnsAddressLines(company).join(', ')

/** True when returns go somewhere other than the trading address. */
export const hasSeparateReturnsAddress = (company: Partial<Company>): boolean =>
  company.returnsAddressSameAsAbove === false &&
  Boolean(company.returnsLocation?.addressLine1?.trim() && company.returnsLocation?.city?.trim())

/** "© 2023–2026 Name" — collapses to a single year when founded this year. */
export const copyrightLine = (company: Partial<Company>, currentYear: number): string => {
  const founded = company.foundedYear
  const range = founded && founded < currentYear ? `${founded}–${currentYear}` : `${currentYear}`
  return `© ${range} ${companyName(company)}`
}
