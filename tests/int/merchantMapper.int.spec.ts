import { describe, it, expect } from 'vitest'

import type { Product } from '@/payload-types'
import { centsToMicros, mapProduct, SKIP_REASONS } from '@/lib/merchant/mapProduct'
import type { MerchantMarket } from '@/lib/merchant/types'

const market: MerchantMarket = {
  feedLabel: 'LT',
  contentLanguage: 'en',
  currencyCode: 'EUR',
}

const SERVER = 'https://shop.example.com'

const product = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 1,
    title: 'Test product',
    slug: 'test-product',
    _status: 'published',
    fulfilment: 'direct',
    feedEligible: true,
    priceInUSD: 2500,
    inventory: 10,
    gallery: [{ id: 'g1', image: { id: 1, url: '/media/a.jpg' } }],
    ...overrides,
  }) as unknown as Product

const mapped = (overrides: Partial<Product> = {}) =>
  mapProduct({ product: product(overrides), market, serverUrl: SERVER })

describe('centsToMicros', () => {
  // A wrong factor here misprices the entire catalogue by 100x in one
  // direction or the other, so it gets pinned explicitly.
  it('converts cents to micros (1 unit = 1,000,000 micros)', () => {
    expect(centsToMicros(2500)).toBe('25000000') // $25.00
    expect(centsToMicros(4999)).toBe('49990000') // $49.99
    expect(centsToMicros(1599)).toBe('15990000') // $15.99 — Google's own example
    expect(centsToMicros(1)).toBe('10000') // one cent
    expect(centsToMicros(0)).toBe('0')
  })

  it('returns a string — amountMicros is an int64 on the wire', () => {
    expect(typeof centsToMicros(2500)).toBe('string')
  })

  it('does not emit floats for fractional cents', () => {
    expect(centsToMicros(10.5)).toBe('105000')
    expect(centsToMicros(0.1)).not.toContain('.')
  })
})

describe('mapProduct — policy gates', () => {
  it('withholds affiliate products even if feedEligible was somehow true', () => {
    // Defence in depth: the hook should already have set feedEligible false.
    // The mapper must not rely on that being intact.
    const result = mapped({ fulfilment: 'affiliate', feedEligible: true } as Partial<Product>)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(SKIP_REASONS.affiliate)
  })

  it('withholds products flagged not eligible', () => {
    const result = mapped({ feedEligible: false })
    expect(result.ok).toBe(false)
  })

  it('withholds manually excluded products', () => {
    const result = mapped({ excludeFromFeed: true } as Partial<Product>)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(SKIP_REASONS.excluded)
  })

  it('withholds drafts', () => {
    const result = mapped({ _status: 'draft' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(SKIP_REASONS.unpublished)
  })

  it('withholds products with no image', () => {
    const result = mapped({ gallery: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(SKIP_REASONS.noImage)
  })

  it('withholds products with no price', () => {
    const result = mapped({ priceInUSD: null })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(SKIP_REASONS.noPrice)
  })

  it('includes a valid direct product', () => {
    expect(mapped().ok).toBe(true)
  })

  it('includes a dropship product — we are merchant of record', () => {
    expect(mapped({ fulfilment: 'dropship' }).ok).toBe(true)
  })
})

describe('mapProduct — payload shape', () => {
  it('nests attributes under productAttributes (v1, not v1beta "attributes")', () => {
    const result = mapped()
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input).toHaveProperty('productAttributes')
    expect(result.input).not.toHaveProperty('attributes')
  })

  it('builds the composite identity fields', () => {
    const result = mapped()
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.offerId).toBe('1')
    expect(result.input.contentLanguage).toBe('en')
    expect(result.input.feedLabel).toBe('LT')
  })

  it('uses the numeric id as offerId, never the slug — Google\'s Merchant `id` attribute caps at 50 chars and this catalogue\'s real slugs run well past that', () => {
    const longSlug = 'a-very-long-descriptive-title-with-an-asin-suffix-that-easily-exceeds-fifty-characters-b0abcdefgh'
    expect(longSlug.length).toBeGreaterThan(50)
    const result = mapped({ id: 42, slug: longSlug })
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.offerId).toBe('42')
    expect(result.input.offerId.length).toBeLessThanOrEqual(50)
  })

  it('emits price as micros with the market currency', () => {
    const result = mapped({ priceInUSD: 4999 })
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.productAttributes.price).toEqual({
      amountMicros: '49990000',
      currencyCode: 'EUR',
    })
  })

  it('makes image and link absolute', () => {
    const result = mapped()
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.productAttributes.imageLink).toBe(`${SERVER}/media/a.jpg`)
    // /products/ prefix is load-bearing: Google crawls this URL — without it
    // every offer 404s and the catalogue is disapproved wholesale.
    expect(result.input.productAttributes.link).toBe(`${SERVER}/products/test-product`)
  })

  it('splits the gallery into primary and additional images', () => {
    const result = mapped({
      gallery: [
        { id: 'g1', image: { id: 1, url: '/media/a.jpg' } },
        { id: 'g2', image: { id: 2, url: '/media/b.jpg' } },
      ],
    } as Partial<Product>)
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.productAttributes.imageLink).toBe(`${SERVER}/media/a.jpg`)
    expect(result.input.productAttributes.additionalImageLinks).toEqual([`${SERVER}/media/b.jpg`])
  })

  it('flags identifierExists false only when gtin and mpn are both absent', () => {
    const without = mapped()
    if (!without.ok) throw new Error('expected mapping to succeed')
    expect(without.input.productAttributes.identifierExists).toBe(false)

    const withGtin = mapped({ gtin: '1234567890123' } as Partial<Product>)
    if (!withGtin.ok) throw new Error('expected mapping to succeed')
    expect(withGtin.input.productAttributes.identifierExists).toBeUndefined()
  })

  it('sends the GTIN as the v1 `gtins` ARRAY — the singular field does not exist in products_v1', () => {
    const result = mapped({ gtin: '1234567890123' } as Partial<Product>)
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.productAttributes.gtins).toEqual(['1234567890123'])
    expect('gtin' in result.input.productAttributes).toBe(false)
  })

  it('falls back to shortDescription when meta.description is empty — same chain as the page itself (generateMeta.ts)', () => {
    // A fresh catalogue with zero hand-written SEO meta must still submit a
    // description, or the whole feed goes out with none — this pins the
    // exact fallback so the page and the feed can't silently diverge again.
    const withoutMeta = mapped({ shortDescription: 'A good short description.' } as Partial<Product>)
    if (!withoutMeta.ok) throw new Error('expected mapping to succeed')
    expect(withoutMeta.input.productAttributes.description).toBe('A good short description.')

    const withMeta = mapped({
      shortDescription: 'A good short description.',
      meta: { description: 'Hand-written SEO description.' },
    } as unknown as Partial<Product>)
    if (!withMeta.ok) throw new Error('expected mapping to succeed')
    expect(withMeta.input.productAttributes.description).toBe('Hand-written SEO description.')

    const withNeither = mapped()
    if (!withNeither.ok) throw new Error('expected mapping to succeed')
    expect(withNeither.input.productAttributes.description).toBeUndefined()
  })

  it('emits itemGroupId/color/size for sibling-family products, and omits them otherwise', () => {
    const sibling = mapped({
      itemGroupId: 'kitchenaid-ksm70',
      color: 'Empire Red',
      size: '7 quarts',
    } as Partial<Product>)
    if (!sibling.ok) throw new Error('expected mapping to succeed')
    expect(sibling.input.productAttributes.itemGroupId).toBe('kitchenaid-ksm70')
    expect(sibling.input.productAttributes.color).toBe('Empire Red')
    expect(sibling.input.productAttributes.size).toBe('7 quarts')

    const standalone = mapped()
    if (!standalone.ok) throw new Error('expected mapping to succeed')
    expect(standalone.input.productAttributes.itemGroupId).toBeUndefined()
    expect(standalone.input.productAttributes.color).toBeUndefined()
  })
})

describe('mapProduct — availability', () => {
  it('marks a direct product out of stock at zero inventory', () => {
    const result = mapped({ inventory: 0 })
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.productAttributes.availability).toBe('out_of_stock')
  })

  it('keeps dropship in stock at zero local inventory — stock sits with the supplier', () => {
    const result = mapped({
      fulfilment: 'dropship',
      inventory: 0,
      supplier: { id: 1, name: 'S', status: 'active' },
    } as unknown as Partial<Product>)
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.productAttributes.availability).toBe('in_stock')
  })

  it('marks dropship out of stock when the supplier is paused', () => {
    const result = mapped({
      fulfilment: 'dropship',
      inventory: 0,
      supplier: { id: 1, name: 'S', status: 'paused' },
    } as unknown as Partial<Product>)
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.productAttributes.availability).toBe('out_of_stock')
  })

  it('carries supplier lead time into handling time', () => {
    const result = mapped({
      fulfilment: 'dropship',
      supplier: { id: 1, name: 'S', status: 'active', defaultLeadTimeDays: 5 },
    } as unknown as Partial<Product>)
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.productAttributes.minHandlingTime).toBe('5')
  })

  it('lets a per-product lead time override the supplier default', () => {
    const result = mapped({
      fulfilment: 'dropship',
      leadTimeDaysOverride: 2,
      supplier: { id: 1, name: 'S', status: 'active', defaultLeadTimeDays: 5 },
    } as unknown as Partial<Product>)
    if (!result.ok) throw new Error('expected mapping to succeed')
    expect(result.input.productAttributes.minHandlingTime).toBe('2')
  })
})

describe('mapProduct — sale pricing', () => {
  // Google matches the page strikethrough against `price` and the transacted
  // amount against `salePrice`. Getting the two swapped advertises the wrong
  // charge — the mismatched-price disapproval in one move.
  it('on sale: price becomes the WAS-price, salePrice the charged price', () => {
    const result = mapped({ priceInUSD: 2500, compareAtPriceInUSD: 3000 } as Partial<Product>)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.input.productAttributes.price.amountMicros).toBe(centsToMicros(3000))
      expect(result.input.productAttributes.salePrice?.amountMicros).toBe(centsToMicros(2500))
    }
  })

  it('off sale: no salePrice key at all, price is the charged price', () => {
    const result = mapped({ priceInUSD: 2500 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.input.productAttributes.price.amountMicros).toBe(centsToMicros(2500))
      expect(result.input.productAttributes).not.toHaveProperty('salePrice')
      expect(result.input.productAttributes).not.toHaveProperty('salePriceEffectiveDate')
    }
  })

  it('an inverted compareAt (≤ price) is ignored — belt to the hook braces', () => {
    const result = mapped({ priceInUSD: 2500, compareAtPriceInUSD: 2500 } as Partial<Product>)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.input.productAttributes.price.amountMicros).toBe(centsToMicros(2500))
      expect(result.input.productAttributes.salePrice).toBeUndefined()
    }
  })

  it('emits salePriceEffectiveDate only for a FUTURE saleEndsAt, in RFC3339 Zulu', () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString()
    const started = new Date(Date.now() - 3 * 86_400_000).toISOString()

    const withWindow = mapped({
      priceInUSD: 2500,
      compareAtPriceInUSD: 3000,
      saleEndsAt: future,
      saleStartedAt: started,
    } as Partial<Product>)
    expect(withWindow.ok).toBe(true)
    if (withWindow.ok) {
      const interval = withWindow.input.productAttributes.salePriceEffectiveDate
      expect(interval?.endTime).toMatch(/Z$/)
      expect(interval?.startTime).toMatch(/Z$/)
    }

    // A past end date must NOT produce an interval — it would tell Google the
    // sale ended while the page still shows it.
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const stale = mapped({
      priceInUSD: 2500,
      compareAtPriceInUSD: 3000,
      saleEndsAt: past,
    } as Partial<Product>)
    expect(stale.ok).toBe(true)
    if (stale.ok) {
      expect(stale.input.productAttributes.salePriceEffectiveDate).toBeUndefined()
      // The sale prices still go — the page still shows both prices.
      expect(stale.input.productAttributes.salePrice?.amountMicros).toBe(centsToMicros(2500))
    }
  })
})
