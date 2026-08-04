import { describe, it, expect } from 'vitest'

import type { Company } from '@/payload-types'
import { buildPlaceholders, resolvePlaceholders } from '@/utilities/companyPlaceholders'
import {
  companyAddressLines,
  hasSeparateReturnsAddress,
  returnsAddress,
  returnsAddressLines,
} from '@/utilities/getCompany'

/**
 * The returns address is where a customer physically posts a parcel. Getting it
 * wrong means goods going to the wrong country — expensive, and unrecoverable
 * once it has shipped.
 *
 * A shop dispatching from Germany into the US normally wants a domestic US
 * returns address, because an international return costs enough to stop the
 * purchase happening at all.
 */

const GERMAN_TRADING: Partial<Company> = {
  name: 'Fenwick & Cole',
  addressLine1: 'Torstraße 140',
  city: 'Berlin',
  postalCode: '10119',
  country: 'DE',
}

const WITH_US_RETURNS: Partial<Company> = {
  ...GERMAN_TRADING,
  returnsAddressSameAsAbove: false,
  returnsLocation: {
    recipient: 'Fenwick & Cole Returns',
    addressLine1: '2100 S Wolf Rd',
    addressLine2: 'Building C',
    city: 'Des Plaines',
    region: 'IL',
    postalCode: '60018',
    country: 'US',
    instructions: 'Write your RMA number on the outside of the parcel.',
  },
}

describe('returns address resolution', () => {
  it('uses the separate address when one is configured', () => {
    const lines = returnsAddressLines(WITH_US_RETURNS)
    expect(lines[0]).toBe('Fenwick & Cole Returns')
    expect(lines).toContain('2100 S Wolf Rd')
    expect(lines).toContain('Des Plaines, IL')
    expect(lines).toContain('US')
    // The German trading address must not leak into it.
    expect(lines.join(' ')).not.toContain('Berlin')
  })

  it('falls back to the trading address when none is set', () => {
    expect(returnsAddressLines(GERMAN_TRADING)).toEqual(companyAddressLines(GERMAN_TRADING))
  })

  it('falls back when the toggle is on, even if a separate address exists', () => {
    const toggledOff = { ...WITH_US_RETURNS, returnsAddressSameAsAbove: true }
    expect(returnsAddress(toggledOff)).toContain('Berlin')
  })

  it('REFUSES a half-filled returns address rather than sending parcels nowhere', () => {
    // A recipient and a country with no street or city is not an address. Better
    // to print the trading address than a block a courier cannot deliver to.
    const incomplete = {
      ...GERMAN_TRADING,
      returnsAddressSameAsAbove: false,
      returnsLocation: { recipient: 'Returns Dept', country: 'US' },
    } as Partial<Company>

    expect(hasSeparateReturnsAddress(incomplete)).toBe(false)
    expect(returnsAddress(incomplete)).toContain('Berlin')
  })

  it('needs both a street and a city to be considered usable', () => {
    const noCity = {
      ...WITH_US_RETURNS,
      returnsLocation: { ...WITH_US_RETURNS.returnsLocation, city: '' },
    } as Partial<Company>
    expect(hasSeparateReturnsAddress(noCity)).toBe(false)

    const noStreet = {
      ...WITH_US_RETURNS,
      returnsLocation: { ...WITH_US_RETURNS.returnsLocation, addressLine1: '' },
    } as Partial<Company>
    expect(hasSeparateReturnsAddress(noStreet)).toBe(false)
  })

  it('skips blank parts instead of leaving double commas', () => {
    const sparse = {
      ...GERMAN_TRADING,
      returnsAddressSameAsAbove: false,
      returnsLocation: { addressLine1: '2100 S Wolf Rd', city: 'Des Plaines', country: 'US' },
    } as Partial<Company>

    expect(returnsAddress(sparse)).not.toContain(', ,')
    expect(returnsAddress(sparse)).toBe('2100 S Wolf Rd, Des Plaines, US')
  })
})

describe('returns placeholders', () => {
  it('tells the customer the return is domestic — a selling point, not admin', () => {
    const map = buildPlaceholders(WITH_US_RETURNS)
    expect(map['company.returnsCountryNote']).toMatch(/United States/)
    expect(map['company.returnsCountryNote']).toMatch(/not shipping internationally/i)
  })

  it('says nothing about country when returns go to the trading address', () => {
    const map = buildPlaceholders(GERMAN_TRADING)
    expect(map['company.returnsCountryNote']).toBe('')
    // …and resolves to empty rather than leaving braces in the policy page.
    expect(resolvePlaceholders('{{company.returnsCountryNote}}', map)).toBe('')
  })

  it('surfaces packing instructions only when they exist', () => {
    expect(buildPlaceholders(WITH_US_RETURNS)['company.returnsInstructions']).toContain('RMA')
    expect(buildPlaceholders(GERMAN_TRADING)['company.returnsInstructions']).toBe('')
    expect(
      resolvePlaceholders('{{company.returnsInstructions}}', buildPlaceholders(GERMAN_TRADING)),
    ).toBe('')
  })

  it('renders a full returns paragraph the way the policy page will', () => {
    const map = buildPlaceholders(WITH_US_RETURNS)
    const copy = 'Returns are received at: {{company.returnsAddress}} {{company.returnsCountryNote}}'
    const resolved = resolvePlaceholders(copy, map)

    expect(resolved).toContain('2100 S Wolf Rd')
    expect(resolved).toContain('Des Plaines, IL')
    expect(resolved).not.toContain('{{')
  })
})
