import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { revivePurchasedCart } from '@/lib/commerce/reviveCart'

/**
 * A purchased cart presented at checkout must self-heal, not dead-end.
 *
 * The scenario: the customer pays, the server marks the cart purchased, but
 * THIS browser never learns (paid in another tab/device, or closed before the
 * return page). Their next checkout attempt used to be refused with "already
 * purchased" — correct about the money, hostile to the customer. Revival
 * carries their current items into a fresh cart and lets them continue.
 */

let payload: Payload
const created: { collection: string; id: number | string }[] = []
const track = (collection: string, id: number | string) => created.push({ collection, id })

let productId: number
let deadCartId: number

describe('revivePurchasedCart', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Revive Test Skillet',
        slug: `revive-test-${Date.now()}`,
        inventory: 9,
        priceInUSDEnabled: true,
        priceInUSD: 27299,
        _status: 'published',
      } as never,
    })
    productId = product.id as number
    track('products', productId)

    const cart = await payload.create({
      collection: 'carts',
      depth: 0,
      data: {
        items: [{ product: productId, quantity: 2 }],
        currency: 'USD',
        // The state the customer's browser doesn't know about:
        purchasedAt: new Date().toISOString(),
      } as never,
    })
    deadCartId = cart.id as number
    track('carts', deadCartId)
  })

  afterAll(async () => {
    for (const { collection, id } of created.reverse()) {
      await payload.delete({ collection: collection as never, id }).catch(() => {})
    }
  })

  it('carries the dead cart’s items into a fresh, unpurchased cart with a usable secret', async () => {
    const dead = (await payload.findByID({
      collection: 'carts',
      id: deadCartId,
      depth: 0,
      overrideAccess: true,
    })) as Record<string, any>

    const revived = await revivePurchasedCart({ payload, cart: dead })
    track('carts', revived.cart.id)

    expect(String(revived.cart.id)).not.toBe(String(deadCartId))
    expect(revived.cart.purchasedAt ?? null).toBeNull()

    const items = revived.cart.items as { product: unknown; quantity: number }[]
    expect(items).toHaveLength(1)
    const itemProduct = items[0]!.product
    expect(String(typeof itemProduct === 'object' ? (itemProduct as any).id : itemProduct)).toBe(
      String(productId),
    )
    expect(items[0]!.quantity).toBe(2)

    // The carts hook recomputes subtotal server-side — 2 × $272.99.
    expect(revived.cart.subtotal).toBe(54598)

    // A guest must be able to own the new cart.
    expect(typeof revived.secret).toBe('string')
    expect((revived.secret ?? '').length).toBeGreaterThanOrEqual(20)
  })

  it('leaves the purchased cart untouched — it is the order’s immutable record', async () => {
    const dead = (await payload.findByID({
      collection: 'carts',
      id: deadCartId,
      depth: 0,
      overrideAccess: true,
    })) as Record<string, any>

    expect(dead.purchasedAt).toBeTruthy()
    expect(dead.items).toHaveLength(1)
  })
})
