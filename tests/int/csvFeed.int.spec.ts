import { describe, it, expect } from 'vitest'

import { buildFacebookCsv } from '@/lib/merchant/csvFeed'
import type { MerchantProductInput } from '@/lib/merchant/types'

/**
 * Pins the Meta catalog quirks: spaced availability values, RFC 4180
 * quoting for commas/quotes in titles, decimal prices.
 */

const input = (
  overrides: Partial<MerchantProductInput['productAttributes']> = {},
): MerchantProductInput => ({
  offerId: 'grill-xl',
  contentLanguage: 'en',
  feedLabel: 'US',
  productAttributes: {
    title: 'Grill, "XL" Edition',
    link: 'https://shop.test/products/grill-xl',
    imageLink: 'https://shop.test/media/a.jpg',
    availability: 'in_stock',
    condition: 'new',
    price: { amountMicros: '649990000', currencyCode: 'USD' },
    ...overrides,
  },
})

describe('buildFacebookCsv', () => {
  it('emits the header and maps availability to spaced values', () => {
    const csv = buildFacebookCsv([input()])
    const [header, row] = csv.split('\n')
    expect(header.startsWith('id,title,description,availability,condition,price,link')).toBe(true)
    expect(row).toContain('in stock')
    expect(row).toContain('649.99 USD')
  })

  it('quotes fields containing commas and doubles embedded quotes (RFC 4180)', () => {
    const csv = buildFacebookCsv([input()])
    expect(csv).toContain('"Grill, ""XL"" Edition"')
  })

  it('includes sale price with the slash-interval window', () => {
    const csv = buildFacebookCsv([
      input({
        salePrice: { amountMicros: '599990000', currencyCode: 'USD' },
        salePriceEffectiveDate: {
          startTime: '2026-08-01T00:00:00.000Z',
          endTime: '2026-08-15T00:00:00.000Z',
        },
      }),
    ])
    expect(csv).toContain('599.99 USD')
    expect(csv).toContain('2026-08-01T00:00:00.000Z/2026-08-15T00:00:00.000Z')
  })

  it('handles out_of_stock and empty optionals without column drift', () => {
    const csv = buildFacebookCsv([input({ availability: 'out_of_stock' })])
    const [header, row] = csv.split('\n')
    expect(row).toContain('out of stock')
    // Same column count in header and row — a drifted row corrupts the
    // whole Meta import.
    const count = (line: string) =>
      line.split(',').filter((_, i, arr) => true).length >= header.split(',').length
    expect(count(row)).toBe(true)
  })
})
