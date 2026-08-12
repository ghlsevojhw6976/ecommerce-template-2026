import type { Company } from '@/payload-types'

import {
  companyAddressLine,
  companyLegalName,
  companyName,
  hasSeparateReturnsAddress,
  returnsAddress,
} from './getCompany'
import { getShippingDisclaimer } from './shippingDisclaimer'

/**
 * Keys that are allowed to resolve to an empty string.
 *
 * Normally an empty value leaves the placeholder visible, so a missing phone
 * number is conspicuous rather than silently blank. A disclaimer that has been
 * deliberately switched off is the opposite case: the admin turned it off on
 * purpose, and leaving `{{company.shippingDisclaimer}}` on the terms page would
 * be a bug, not a helpful prompt.
 */
export const ALWAYS_RESOLVE = new Set([
  'company.shippingDisclaimer',
  'company.returnsInstructions',
  'company.returnsCountryNote',
])

/**
 * `{{company.*}}` placeholders for CMS content.
 *
 * The problem this solves: returns, terms, privacy and shipping pages are ~90%
 * identical across shops, and the 10% that differs is exactly this data. Without
 * placeholders, launching a shop means find-and-replacing an address through
 * five long documents — and the one you miss is the one with the previous
 * client's phone number on it.
 *
 * With them, policy pages are written once, seeded into every shop, and stay
 * correct because they read from Company settings at render time. Change the
 * returns window in one place and every page that mentions it updates.
 *
 * Deliberately a string substitution rather than React components: this content
 * lives in the rich text editor, where a marketer can type `{{company.phone}}`
 * mid-sentence and nothing else is required of them.
 */

export type PlaceholderMap = Record<string, string>

const money = (minorUnits?: number | null): string =>
  typeof minorUnits === 'number' ? `$${(minorUnits / 100).toFixed(2)}` : ''

const plural = (count: number | null | undefined, singular: string): string =>
  typeof count === 'number' ? `${count} ${singular}${count === 1 ? '' : 's'}` : ''

export const buildPlaceholders = (company: Partial<Company>): PlaceholderMap => ({
  'company.name': companyName(company),
  'company.legalName': companyLegalName(company),
  'company.tagline': company.tagline ?? '',
  'company.email': company.email ?? '',
  'company.supportEmail': company.supportEmail || company.email || '',
  'company.phone': company.phone ?? '',
  'company.supportHours': company.supportHours ?? '',
  'company.address': companyAddressLine(company),
  'company.returnsAddress': returnsAddress(company),
  'company.city': company.city ?? '',
  'company.country': company.country ?? '',
  'company.companyNumber': company.companyNumber ?? '',
  'company.taxId': company.taxId ?? '',
  'company.jurisdiction': company.jurisdiction ?? '',

  // Policy values — the whole point of centralising them is that the returns
  // page and the product page can never disagree about the window.
  'company.returnWindowDays': String(company.returnWindowDays ?? 30),
  'company.returnWindow': plural(company.returnWindowDays ?? 30, 'day'),
  'company.warrantyMonths': String(company.defaultWarrantyMonths ?? ''),
  'company.processingTime': plural(company.processingTimeDays ?? 2, 'business day'),
  'company.freeShippingThreshold': money(company.freeShippingThreshold),
  'company.flatShippingFee': money(company.flatShippingFee),
  'company.returnsShippingPaidBy':
    company.returnsShippingPaidBy === 'customer' ? 'the customer' : companyName(company),

  // Empty when the disclaimer is switched off — see ALWAYS_RESOLVE.
  'company.shippingDisclaimer': getShippingDisclaimer(company).text,

  // The answer to "how long does delivery take?" — in BOTH modes, so policy
  // pages can state delivery times once and stay true when the cross-border
  // toggle flips. Enabled: the full origin/window/customs statement (identical
  // to the disclaimer, so pages cannot contradict it). Disabled: the domestic
  // tiers. Never empty — a delivery question must never render answerless.
  'company.deliveryTimes': ((): string => {
    const disclaimer = getShippingDisclaimer(company)
    if (disclaimer.enabled) return disclaimer.text
    const processing = plural(company.processingTimeDays ?? 2, 'business day')
    return (
      `We dispatch within ${processing}. Standard delivery takes 3–5 business days ` +
      `after dispatch; expedited and next-day options are shown at checkout where available.`
    )
  })(),

  // Returns instructions attached to the address, e.g. an RMA requirement.
  'company.returnsInstructions': hasSeparateReturnsAddress(company)
    ? (company.returnsLocation?.instructions?.trim() ?? '')
    : '',

  // "Returns are handled domestically in the US" is a selling point, not
  // admin — an international return is expensive enough to stop a purchase.
  'company.returnsCountryNote': hasSeparateReturnsAddress(company)
    ? `Returns are received in ${company.returnsLocation?.country?.trim() === 'US' ? 'the United States' : (company.returnsLocation?.country?.trim() ?? 'our returns facility')}, so you are not shipping internationally.`
    : '',
})

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

/**
 * Replaces placeholders in a plain string.
 *
 * An unknown or empty key is left visible as `{{company.phone}}` rather than
 * silently blanked — a policy page with a conspicuous gap gets fixed, whereas
 * one that quietly reads "Call us on ." does not.
 */
export const resolvePlaceholders = (input: string, map: PlaceholderMap): string =>
  input.replace(PLACEHOLDER, (match, key: string) => {
    const value = map[key]
    if (value) return value
    // A deliberately-disabled value resolves to nothing; an unconfigured one
    // stays visible so somebody notices it.
    if (ALWAYS_RESOLVE.has(key)) return ''
    return match
  })

/**
 * Walks a Lexical rich-text tree and resolves placeholders in every text node.
 *
 * Structure-preserving: only `text` properties on nodes of type `text` are
 * touched, so formatting, links and blocks are untouched.
 */
export const resolvePlaceholdersInRichText = <T,>(node: T, map: PlaceholderMap): T => {
  if (Array.isArray(node)) {
    return node.map((child) => resolvePlaceholdersInRichText(child, map)) as unknown as T
  }

  if (node && typeof node === 'object') {
    const source = node as Record<string, unknown>
    const output: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(source)) {
      if (key === 'text' && typeof value === 'string' && source.type === 'text') {
        output[key] = resolvePlaceholders(value, map)
      } else if (value && typeof value === 'object') {
        output[key] = resolvePlaceholdersInRichText(value, map)
      } else {
        output[key] = value
      }
    }

    return output as T
  }

  return node
}

/** Every key available, for the admin help panel. */
export const availablePlaceholders = (company: Partial<Company>): string[] =>
  Object.keys(buildPlaceholders(company)).map((key) => `{{${key}}}`)
