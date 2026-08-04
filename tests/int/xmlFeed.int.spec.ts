import { describe, it, expect } from 'vitest'

import type { MerchantProductInput } from '@/lib/merchant/types'
import { buildXmlFeed, microsToFeedPrice } from '@/lib/merchant/xmlFeed'

/**
 * Pins the feed-FILE format deltas from the Merchant API shape — the file
 * spec is older and differs exactly where a confusion would be expensive:
 * decimal prices (not micros), singular g:gtin, slash-interval sale window.
 */

const input = (overrides: Partial<MerchantProductInput['productAttributes']> = {}): MerchantProductInput => ({
  offerId: 'grill-xl',
  contentLanguage: 'en',
  feedLabel: 'US',
  productAttributes: {
    title: 'Grill <XL> & Co',
    link: 'https://shop.test/products/grill-xl',
    imageLink: 'https://shop.test/media/a.jpg',
    availability: 'in_stock',
    condition: 'new',
    price: { amountMicros: '649990000', currencyCode: 'USD' },
    ...overrides,
  },
})

describe('microsToFeedPrice', () => {
  it('converts micros to decimal + currency (the file format)', () => {
    expect(microsToFeedPrice('649990000', 'USD')).toBe('649.99 USD')
    expect(microsToFeedPrice('25000000', 'USD')).toBe('25.00 USD')
    expect(microsToFeedPrice('10000', 'USD')).toBe('0.01 USD')
  })
})

describe('buildXmlFeed', () => {
  it('produces valid RSS with the g: namespace and escaped content', () => {
    const xml = buildXmlFeed({ inputs: [input()], shopName: 'Acme & Co', serverUrl: 'https://shop.test' })
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"')
    expect(xml).toContain('<title>Acme &amp; Co</title>')
    expect(xml).toContain('<g:title>Grill &lt;XL&gt; &amp; Co</g:title>')
    expect(xml).toContain('<g:price>649.99 USD</g:price>')
    expect(xml).not.toContain('Grill <XL>')
  })

  it('emits sale price with the slash-interval effective date', () => {
    const xml = buildXmlFeed({
      inputs: [
        input({
          salePrice: { amountMicros: '599990000', currencyCode: 'USD' },
          salePriceEffectiveDate: {
            startTime: '2026-08-01T00:00:00.000Z',
            endTime: '2026-08-15T00:00:00.000Z',
          },
        }),
      ],
      shopName: 'Acme',
      serverUrl: 'https://shop.test',
    })
    expect(xml).toContain('<g:sale_price>599.99 USD</g:sale_price>')
    expect(xml).toContain(
      '<g:sale_price_effective_date>2026-08-01T00:00:00.000Z/2026-08-15T00:00:00.000Z</g:sale_price_effective_date>',
    )
  })

  it('flattens the API gtins array to the file spec singular g:gtin', () => {
    const xml = buildXmlFeed({
      inputs: [input({ gtins: ['00012345678905'] })],
      shopName: 'Acme',
      serverUrl: 'https://shop.test',
    })
    expect(xml).toContain('<g:gtin>00012345678905</g:gtin>')
    expect(xml).not.toContain('gtins')
  })

  it('says identifier_exists "no" only when the mapper flagged it', () => {
    const flagged = buildXmlFeed({
      inputs: [input({ identifierExists: false })],
      shopName: 'A',
      serverUrl: 'https://s.t',
    })
    expect(flagged).toContain('<g:identifier_exists>no</g:identifier_exists>')

    const normal = buildXmlFeed({ inputs: [input()], shopName: 'A', serverUrl: 'https://s.t' })
    expect(normal).not.toContain('identifier_exists')
  })
})
