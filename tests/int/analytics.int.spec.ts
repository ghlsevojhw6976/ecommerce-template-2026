import { describe, it, expect } from 'vitest'

import { centsToGa, gaItem, itemsValue } from '@/lib/analytics/items'
import { orderToGaPurchase } from '@/lib/analytics/purchase'
import type { Order } from '@/payload-types'

/**
 * Pins the GA4 payload contract — the analytics sibling of the mapper's
 * cents→micros test. A wrong conversion here misreports every revenue figure
 * by 100×; a drifted item shape silently breaks Ads/GA joins.
 */

describe('centsToGa', () => {
  it('converts integer cents to decimal currency units', () => {
    expect(centsToGa(49999)).toBe(499.99)
    expect(centsToGa(100)).toBe(1)
    expect(centsToGa(1)).toBe(0.01)
    expect(centsToGa(0)).toBe(0)
  })
})

describe('gaItem', () => {
  it('uses the slug as item_id — the Merchant feed offerId, so GA/Ads/GMC join on one key', () => {
    const item = gaItem({
      slug: 'mixer-pro',
      id: 7,
      title: 'Mixer Pro',
      priceInUSD: 54999,
      brand: 'Acme',
    })
    expect(item.item_id).toBe('mixer-pro')
    expect(item.item_name).toBe('Mixer Pro')
    expect(item.price).toBe(549.99)
    expect(item.quantity).toBe(1)
    expect(item.item_brand).toBe('Acme')
  })

  it('emits discount only for a genuine compare-at, in decimal units', () => {
    const onSale = gaItem({ slug: 'a', priceInUSD: 46000, compareAtPriceInUSD: 50000 })
    expect(onSale.discount).toBe(40)

    const inverted = gaItem({ slug: 'b', priceInUSD: 50000, compareAtPriceInUSD: 40000 })
    expect(inverted.discount).toBeUndefined()
  })

  it('falls back to the id when a slug is missing', () => {
    expect(gaItem({ id: 42, title: 'X', priceInUSD: 100 }).item_id).toBe('42')
  })
})

describe('itemsValue', () => {
  it('sums price × quantity without float drift', () => {
    const value = itemsValue([
      { item_id: 'a', item_name: 'A', price: 499.99, quantity: 2 },
      { item_id: 'b', item_name: 'B', price: 0.01, quantity: 3 },
    ])
    expect(value).toBe(1000.01)
  })
})

describe('orderToGaPurchase', () => {
  const order = {
    id: 102,
    amount: 279995,
    currency: 'USD',
    items: [
      {
        product: { slug: 'grill-xl', title: 'Grill XL', priceInUSD: 139999 },
        quantity: 2,
      },
      // Product deleted since purchase — resolves to an id, must be skipped.
      { product: 55, quantity: 1 },
    ],
  } as unknown as Order

  it('keys the transaction on the order id and prefers the charged amount', () => {
    const purchase = orderToGaPurchase(order)
    expect(purchase.transaction_id).toBe('102')
    expect(purchase.value).toBe(2799.95)
    expect(purchase.currency).toBe('USD')
    expect(purchase.items).toHaveLength(1)
    expect(purchase.items[0]).toMatchObject({ item_id: 'grill-xl', quantity: 2, price: 1399.99 })
  })

  it('falls back to line-item math when the order has no amount', () => {
    const purchase = orderToGaPurchase({ ...order, amount: null } as unknown as Order)
    expect(purchase.value).toBe(2799.98)
  })
})
