import { describe, it, expect } from 'vitest'

import type { Company } from '@/payload-types'
import {
  buildPlaceholders,
  resolvePlaceholders,
  resolvePlaceholdersInRichText,
} from '@/utilities/companyPlaceholders'
import {
  companyAddressLine,
  companyAddressLines,
  companyLegalName,
  companyName,
  copyrightLine,
  returnsAddress,
} from '@/utilities/getCompany'

/**
 * Company data drives the header, footer and every policy page. Getting it
 * wrong means shipping a shop with the wrong address, the wrong returns window,
 * or a sentence reading "Call us on ." — all of which are visible to customers
 * and some of which are legal problems.
 */

const COMPANY: Partial<Company> = {
  name: 'Fenwick & Cole',
  legalName: 'Fenwick & Cole LLC',
  foundedYear: 2021,
  email: 'hello@fenwickcole.com',
  supportEmail: 'support@fenwickcole.com',
  phone: '+1 (312) 555-0142',
  supportHours: 'Mon–Fri, 9am–5pm CT',
  addressLine1: '411 W Ontario St',
  addressLine2: 'Suite 300',
  city: 'Chicago',
  region: 'IL',
  postalCode: '60654',
  country: 'US',
  companyNumber: 'IL-8842119',
  taxId: '88-4211900',
  jurisdiction: 'the State of Illinois, USA',
  returnWindowDays: 30,
  defaultWarrantyMonths: 24,
  processingTimeDays: 2,
  freeShippingThreshold: 7500,
  returnsShippingPaidBy: 'merchant',
  returnsAddressSameAsAbove: true,
}

describe('company accessors', () => {
  it('falls back rather than rendering "undefined" anywhere', () => {
    expect(companyName({})).toBe('Your Shop')
    expect(companyLegalName({})).toBe('Your Shop')
    expect(companyAddressLine({})).toBe('')
    expect(companyAddressLines({})).toEqual([])
  })

  it('uses the trading name when no legal entity is set', () => {
    expect(companyLegalName({ name: 'Acme' })).toBe('Acme')
    expect(companyLegalName(COMPANY)).toBe('Fenwick & Cole LLC')
  })

  it('skips blank address parts instead of leaving double commas', () => {
    const sparse = { addressLine1: '411 W Ontario St', city: 'Chicago', country: 'US' }
    expect(companyAddressLine(sparse)).toBe('411 W Ontario St, Chicago, US')
    expect(companyAddressLine(sparse)).not.toContain(', ,')
  })

  it('uses a separate returns address only when one is set', () => {
    expect(returnsAddress(COMPANY)).toBe(companyAddressLine(COMPANY))

    const withDepot = {
      ...COMPANY,
      returnsAddressSameAsAbove: false,
      returnsLocation: {
        recipient: 'Returns Depot',
        addressLine1: '12 Mill Rd',
        city: 'Gary',
        region: 'IN',
        postalCode: '46402',
        country: 'US',
      },
    }
    expect(returnsAddress(withDepot)).toContain('Returns Depot')
    expect(returnsAddress(withDepot)).toContain('12 Mill Rd')
  })

  it('ignores a separate returns address that was left blank', () => {
    const broken = {
      ...COMPANY,
      returnsAddressSameAsAbove: false,
      returnsLocation: { recipient: 'Returns Depot' },
    }
    expect(returnsAddress(broken)).toBe(companyAddressLine(COMPANY))
  })

  it('collapses the copyright range in the founding year', () => {
    expect(copyrightLine(COMPANY, 2026)).toBe('© 2021–2026 Fenwick & Cole')
    expect(copyrightLine({ ...COMPANY, foundedYear: 2026 }, 2026)).toBe('© 2026 Fenwick & Cole')
    expect(copyrightLine({ name: 'Acme' }, 2026)).toBe('© 2026 Acme')
  })
})

describe('placeholders', () => {
  const map = buildPlaceholders(COMPANY)

  it('resolves the values policy pages actually reference', () => {
    expect(resolvePlaceholders('Contact {{company.name}} on {{company.phone}}.', map)).toBe(
      'Contact Fenwick & Cole on +1 (312) 555-0142.',
    )
    expect(resolvePlaceholders('Return within {{company.returnWindow}}.', map)).toBe(
      'Return within 30 days.',
    )
    expect(resolvePlaceholders('Governed by {{company.jurisdiction}}.', map)).toBe(
      'Governed by the State of Illinois, USA.',
    )
  })

  it('formats money from minor units', () => {
    expect(map['company.freeShippingThreshold']).toBe('$75.00')
  })

  it('pluralises correctly', () => {
    expect(buildPlaceholders({ returnWindowDays: 1 })['company.returnWindow']).toBe('1 day')
    expect(buildPlaceholders({ returnWindowDays: 14 })['company.returnWindow']).toBe('14 days')
  })

  it('names who pays return shipping', () => {
    expect(map['company.returnsShippingPaidBy']).toBe('Fenwick & Cole')
    expect(
      buildPlaceholders({ ...COMPANY, returnsShippingPaidBy: 'customer' })[
        'company.returnsShippingPaidBy'
      ],
    ).toBe('the customer')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(resolvePlaceholders('{{ company.name }}', map)).toBe('Fenwick & Cole')
  })

  it('LEAVES unknown or empty placeholders visible rather than blanking them', () => {
    // A policy page with a conspicuous gap gets fixed. One that quietly reads
    // "Call us on ." does not.
    expect(resolvePlaceholders('Call us on {{company.phone}}.', buildPlaceholders({}))).toBe(
      'Call us on {{company.phone}}.',
    )
    expect(resolvePlaceholders('{{company.nonsense}}', map)).toBe('{{company.nonsense}}')
  })

  it('leaves ordinary text untouched', () => {
    expect(resolvePlaceholders('No placeholders here at all.', map)).toBe(
      'No placeholders here at all.',
    )
  })

  it('falls back from support email to the general email', () => {
    expect(buildPlaceholders({ email: 'a@b.com' })['company.supportEmail']).toBe('a@b.com')
    expect(map['company.supportEmail']).toBe('support@fenwickcole.com')
  })
})

describe('rich text resolution', () => {
  const map = buildPlaceholders(COMPANY)

  const tree = {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Returns accepted within {{company.returnWindow}}.', format: 1 },
            { type: 'text', text: ' Send to {{company.returnsAddress}}.', format: 0 },
          ],
        },
        {
          type: 'link',
          fields: { url: '/contact' },
          children: [{ type: 'text', text: 'Email {{company.supportEmail}}', format: 0 }],
        },
      ],
    },
  }

  it('resolves placeholders in nested text nodes', () => {
    const resolved = resolvePlaceholdersInRichText(tree, map) as typeof tree
    const [first, second] = resolved.root.children[0]!.children as { text: string }[]

    expect(first!.text).toBe('Returns accepted within 30 days.')
    expect(second!.text).toContain('411 W Ontario St')
  })

  it('reaches text inside links and other wrappers', () => {
    const resolved = resolvePlaceholdersInRichText(tree, map) as typeof tree
    const linkText = (resolved.root.children[1]!.children as { text: string }[])[0]!
    expect(linkText.text).toBe('Email support@fenwickcole.com')
  })

  it('preserves structure and formatting exactly', () => {
    const resolved = resolvePlaceholdersInRichText(tree, map) as typeof tree
    expect(resolved.root.type).toBe('root')
    expect(resolved.root.children).toHaveLength(2)
    expect((resolved.root.children[0]!.children as { format: number }[])[0]!.format).toBe(1)
    expect((resolved.root.children[1] as { fields: { url: string } }).fields.url).toBe('/contact')
  })

  it('does not mutate the original tree', () => {
    const original = JSON.stringify(tree)
    resolvePlaceholdersInRichText(tree, map)
    expect(JSON.stringify(tree)).toBe(original)
  })

  it('only rewrites text nodes — a non-text node with a text field is left alone', () => {
    const odd = { type: 'upload', text: '{{company.name}}' }
    const resolved = resolvePlaceholdersInRichText(odd, map) as typeof odd
    expect(resolved.text).toBe('{{company.name}}')
  })

  it('survives null and primitive leaves', () => {
    expect(resolvePlaceholdersInRichText(null, map)).toBeNull()
    expect(resolvePlaceholdersInRichText(42, map)).toBe(42)
  })
})
