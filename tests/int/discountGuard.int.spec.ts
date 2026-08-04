import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { getDiscount, gmcAnnotationWarnings, totalSavingsCents } from '@/lib/commerce/discount'
import type { Product } from '@/payload-types'

/**
 * Guards the discount MODEL — do not delete.
 *
 * The whole design rests on two invariants:
 *   1. `priceInUSD` is the charged price, always. Nothing computes an
 *      "effective price" — display and charge read the same column.
 *   2. `compareAtPriceInUSD` cannot persist unless genuinely above the
 *      current price — a fake was-price is impossible to store, whatever a
 *      client submits (FTC / CA §17501 exposure lives here).
 */

let payload: Payload
const created: (number | string)[] = []

const makeProduct = async (data: Record<string, unknown>): Promise<Product> => {
  const doc = (await payload.create({
    collection: 'products',
    data: {
      title: 'Discount guard product',
      slug: `discount-guard-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      _status: 'published',
      priceInUSDEnabled: true,
      inventory: 5,
      ...data,
    } as never,
    context: { disableRevalidate: true },
  })) as Product
  created.push(doc.id)
  return doc
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
})

afterAll(async () => {
  for (const id of created) {
    await payload.delete({ collection: 'products', id }).catch(() => {})
  }
})

describe('normalizeDiscount hook', () => {
  it('persists a genuine was-price and stamps saleStartedAt', async () => {
    const doc = await makeProduct({ priceInUSD: 50000, compareAtPriceInUSD: 60000 })

    expect(doc.compareAtPriceInUSD).toBe(60000)
    expect(doc.saleStartedAt).toBeTruthy()
  })

  it('nulls a compareAt equal to the price — and its companions with it', async () => {
    const doc = await makeProduct({
      priceInUSD: 50000,
      compareAtPriceInUSD: 50000,
      saleEndsAt: new Date(Date.now() + 86_400_000).toISOString(),
    })

    expect(doc.compareAtPriceInUSD).toBeNull()
    expect(doc.saleEndsAt).toBeNull()
    expect(doc.saleStartedAt).toBeNull()
  })

  it('nulls an inverted compareAt (below the price)', async () => {
    const doc = await makeProduct({ priceInUSD: 50000, compareAtPriceInUSD: 40000 })
    expect(doc.compareAtPriceInUSD).toBeNull()
  })

  it('nulls a compareAt when there is no price to compare against', async () => {
    const doc = await makeProduct({ priceInUSD: null, compareAtPriceInUSD: 60000 })
    expect(doc.compareAtPriceInUSD).toBeNull()
  })

  it('preserves the original saleStartedAt across subsequent saves, and clears it when the sale ends', async () => {
    const doc = await makeProduct({ priceInUSD: 50000, compareAtPriceInUSD: 60000 })
    const startedAt = doc.saleStartedAt

    // A later edit (deepen the discount) must not restart the clock — the
    // stamp is reference-pricing provenance, not a modified date.
    const updated = (await payload.update({
      collection: 'products',
      id: doc.id,
      data: { priceInUSD: 45000, _status: 'published' } as never,
      context: { disableRevalidate: true },
    })) as Product
    expect(updated.saleStartedAt).toBe(startedAt)

    // Ending the sale clears everything.
    const ended = (await payload.update({
      collection: 'products',
      id: doc.id,
      data: { compareAtPriceInUSD: null, _status: 'published' } as never,
      context: { disableRevalidate: true },
    })) as Product
    expect(ended.compareAtPriceInUSD).toBeNull()
    expect(ended.saleStartedAt).toBeNull()
  })
})

describe('select behaviour — why effective-price hooks are banned', () => {
  it('a select on priceInUSD alone returns a doc WITHOUT compareAtPriceInUSD', async () => {
    // This is the documented reason the model is "lower priceInUSD + display
    // compareAt", never "compute the price in a hook": the plugin's cart
    // subtotal hook fetches products with select {priceInUSD: true}, so any
    // sale field would be invisible to the charge path. If this test ever
    // fails (Payload changes select semantics), the constraint should be
    // re-evaluated — not silently assumed.
    const doc = await makeProduct({ priceInUSD: 50000, compareAtPriceInUSD: 60000 })

    const selected = await payload.findByID({
      collection: 'products',
      id: doc.id,
      select: { priceInUSD: true },
    })

    expect(selected.priceInUSD).toBe(50000)
    expect(selected).not.toHaveProperty('compareAtPriceInUSD')
  })
})

describe('the charge path', () => {
  it('a cart holding an on-sale product subtotals at priceInUSD — compareAt never charges', async () => {
    // THE invariant. The plugin's carts beforeChange hook recomputes subtotal
    // from the products' priceInUSD on every write; Checkout Session line
    // items are built from the same column. If this fails, customers are being
    // charged a price they were not shown.
    const doc = await makeProduct({ priceInUSD: 50000, compareAtPriceInUSD: 60000 })

    const cart = await payload.create({
      collection: 'carts',
      depth: 0,
      data: {
        items: [{ product: doc.id, quantity: 2 }],
        currency: 'USD',
      } as never,
    })

    expect((cart as { subtotal?: number }).subtotal).toBe(100000)

    await payload.delete({ collection: 'carts', id: cart.id }).catch(() => {})
  })
})

describe('getDiscount', () => {
  it('computes savings, percent and labels', () => {
    const discount = getDiscount({ priceInUSD: 64400, compareAtPriceInUSD: 69999 })
    expect(discount).not.toBeNull()
    expect(discount!.savingsCents).toBe(5599)
    expect(discount!.savingsPercent).toBe(8)
    expect(discount!.badgeLabel).toBe('8% off')
    expect(discount!.savingsLine).toBe('You save $55.99 (8%)')
  })

  it('returns null on equal, inverted or missing prices', () => {
    expect(getDiscount({ priceInUSD: 5000, compareAtPriceInUSD: 5000 })).toBeNull()
    expect(getDiscount({ priceInUSD: 5000, compareAtPriceInUSD: 4000 })).toBeNull()
    expect(getDiscount({ priceInUSD: null, compareAtPriceInUSD: 5000 })).toBeNull()
    expect(getDiscount({ priceInUSD: 5000 })).toBeNull()
    expect(getDiscount(null)).toBeNull()
  })

  it('sums per-line savings times quantity for the Total savings row', () => {
    const total = totalSavingsCents([
      { product: { priceInUSD: 5000, compareAtPriceInUSD: 6000 }, quantity: 2 },
      { product: { priceInUSD: 5000 }, quantity: 3 }, // off-sale line contributes 0
    ])
    expect(total).toBe(2000)
  })
})

describe('gmcAnnotationWarnings', () => {
  it('warns at the 5% floor and the 90% ceiling, silent in between', () => {
    // Exactly 5% — Google requires GREATER than 5%.
    expect(
      gmcAnnotationWarnings({ priceInUSD: 9500, compareAtPriceInUSD: 10000 }).length,
    ).toBe(1)
    // 8% — inside the band.
    expect(
      gmcAnnotationWarnings({ priceInUSD: 9200, compareAtPriceInUSD: 10000 }).length,
    ).toBe(0)
    // 91% — above the ceiling.
    expect(
      gmcAnnotationWarnings({ priceInUSD: 900, compareAtPriceInUSD: 10000 }).length,
    ).toBe(1)
  })

  it('warns on a stale saleEndsAt and a sale older than 90 days', () => {
    const stale = gmcAnnotationWarnings({
      priceInUSD: 9000,
      compareAtPriceInUSD: 10000,
      saleEndsAt: new Date(Date.now() - 86_400_000).toISOString(),
    })
    expect(stale.some((warning) => warning.includes('saleEndsAt is in the past'))).toBe(true)

    const old = gmcAnnotationWarnings({
      priceInUSD: 9000,
      compareAtPriceInUSD: 10000,
      saleStartedAt: new Date(Date.now() - 91 * 86_400_000).toISOString(),
    })
    expect(old.some((warning) => warning.includes('90'))).toBe(true)
  })

  it('stays quiet off-sale', () => {
    expect(gmcAnnotationWarnings({ priceInUSD: 9000 })).toEqual([])
  })
})
