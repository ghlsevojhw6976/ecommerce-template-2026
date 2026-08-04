import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type Stripe from 'stripe'

import { ensureOrderForPaymentIntent } from '@/lib/stripe/ensureOrder'
import { adjustInventory, adjustmentsFromItems } from '@/lib/stripe/inventory'
import { stripeWebhookHandlers, handledWebhookEvents } from '@/lib/stripe/webhookHandlers'

/**
 * These cover the failure modes that cost real money:
 *  - a paid customer with no order (closed tab)
 *  - a duplicate webhook creating a second order or double-decrementing stock
 *  - oversell under concurrency
 */

let payload: Payload
const createdProducts: number[] = []
const createdTransactions: number[] = []
const createdOrders: number[] = []
const createdEvents: number[] = []

const uniq = () => Math.random().toString(36).slice(2, 10)

const makeProduct = async (inventory = 10) => {
  const doc = await payload.create({
    collection: 'products',
    data: {
      title: `wh-test-${uniq()}`,
      fulfilment: 'direct',
      priceInUSD: 2500,
      inventory,
      _status: 'published',
    } as never,
  })
  createdProducts.push(doc.id as number)
  return doc
}

const makeTransaction = async (data: Record<string, unknown>) => {
  const doc = await payload.create({
    collection: 'transactions',
    data: {
      paymentMethod: 'stripe',
      amount: 2500,
      currency: 'USD',
      customerEmail: 'buyer@example.com',
      ...data,
    } as never,
  })
  createdTransactions.push(doc.id as number)
  return doc
}

const intent = (id: string, overrides: Partial<Stripe.PaymentIntent> = {}) =>
  ({
    id,
    object: 'payment_intent',
    status: 'succeeded',
    amount: 2500,
    currency: 'usd',
    metadata: {},
    ...overrides,
  }) as unknown as Stripe.PaymentIntent

const inventoryOf = async (id: number): Promise<number> => {
  const doc = await payload.findByID({ collection: 'products', id, depth: 0 })
  return Number((doc as Record<string, any>).inventory ?? 0)
}

describe('webhook handler registration', () => {
  it('registers the events the admin page claims are handled', () => {
    expect(handledWebhookEvents).toContain('payment_intent.succeeded')
    expect(handledWebhookEvents).toContain('charge.refunded')
    expect(handledWebhookEvents).toContain('charge.dispute.created')
    expect(handledWebhookEvents).toContain('payment_intent.payment_failed')
  })

  it('exposes every handler as a callable function', () => {
    for (const key of handledWebhookEvents) {
      expect(typeof stripeWebhookHandlers[key]).toBe('function')
    }
  })
})

describe('adjustmentsFromItems', () => {
  it('prefers the variant over the product, since variants hold their own stock', () => {
    const adjustments = adjustmentsFromItems([{ product: 1, variant: 7, quantity: 2 }])
    expect(adjustments).toEqual([{ collection: 'variants', id: 7, decrementBy: 2 }])
  })

  it('falls back to the product when there is no variant', () => {
    expect(adjustmentsFromItems([{ product: 3, quantity: 4 }])).toEqual([
      { collection: 'products', id: 3, decrementBy: 4 },
    ])
  })

  it('inverts the sign when restocking', () => {
    expect(adjustmentsFromItems([{ product: 3, quantity: 4 }], 'restock')).toEqual([
      { collection: 'products', id: 3, decrementBy: -4 },
    ])
  })

  it('ignores malformed or zero-quantity items instead of throwing', () => {
    expect(adjustmentsFromItems([{ quantity: 0, product: 1 }, {}, null, 'nope'])).toEqual([])
    expect(adjustmentsFromItems(undefined)).toEqual([])
  })
})

describe('atomic inventory', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  afterAll(async () => {
    for (const id of createdEvents) {
      await payload.delete({ collection: 'stripe-events', id }).catch(() => {})
    }
    for (const id of createdOrders) {
      await payload.delete({ collection: 'orders', id }).catch(() => {})
    }
    for (const id of createdTransactions) {
      await payload.delete({ collection: 'transactions', id }).catch(() => {})
    }
    for (const id of createdProducts) {
      await payload.delete({ collection: 'products', id }).catch(() => {})
    }
  })

  it('decrements stock', async () => {
    const product = await makeProduct(10)
    await adjustInventory({
      payload,
      adjustments: [{ collection: 'products', id: product.id as number, decrementBy: 3 }],
    })
    expect(await inventoryOf(product.id as number)).toBe(7)
  })

  it('restocks on a negative adjustment', async () => {
    const product = await makeProduct(5)
    await adjustInventory({
      payload,
      adjustments: [{ collection: 'products', id: product.id as number, decrementBy: -2 }],
    })
    expect(await inventoryOf(product.id as number)).toBe(7)
  })

  it('flags oversell rather than silently clamping at zero', async () => {
    const product = await makeProduct(1)
    const [result] = await adjustInventory({
      payload,
      adjustments: [{ collection: 'products', id: product.id as number, decrementBy: 3 }],
    })
    expect(result.oversold).toBe(true)
    expect(result.newInventory).toBe(-2)
  })

  it('does not lose concurrent decrements', async () => {
    // Read-modify-write would leave this at 9. Atomic SQL leaves it at 0.
    const product = await makeProduct(10)
    await Promise.all(
      Array.from({ length: 10 }, () =>
        adjustInventory({
          payload,
          adjustments: [{ collection: 'products', id: product.id as number, decrementBy: 1 }],
        }),
      ),
    )
    expect(await inventoryOf(product.id as number)).toBe(0)
  })
})

describe('ensureOrderForPaymentIntent', () => {
  it('ignores an intent that has not succeeded', async () => {
    const result = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(`pi_${uniq()}`, { status: 'processing' }),
    })
    expect(result.created).toBe(false)
    expect(result.reason).toMatch(/not succeeded/i)
  })

  it('ignores an intent belonging to no local transaction', async () => {
    const result = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(`pi_unknown_${uniq()}`),
    })
    expect(result.created).toBe(false)
    expect(result.reason).toMatch(/no local transaction/i)
  })

  it('creates the order the closed-tab customer never got, and decrements stock', async () => {
    const product = await makeProduct(10)
    const piId = `pi_${uniq()}`
    const items = [{ product: product.id, quantity: 2 }]

    await makeTransaction({
      status: 'pending',
      items,
      stripe: { paymentIntentID: piId },
    })

    const result = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(piId, {
        metadata: { cartItemsSnapshot: JSON.stringify(items) } as never,
      }),
    })

    expect(result.created).toBe(true)
    expect(result.orderId).toBeDefined()
    createdOrders.push(result.orderId as number)
    expect(await inventoryOf(product.id as number)).toBe(8)
  })

  it('is idempotent — a repeated delivery creates no second order and no second decrement', async () => {
    const product = await makeProduct(10)
    const piId = `pi_${uniq()}`
    const items = [{ product: product.id, quantity: 2 }]

    await makeTransaction({
      status: 'pending',
      items,
      stripe: { paymentIntentID: piId },
    })

    const paymentIntent = intent(piId, {
      metadata: { cartItemsSnapshot: JSON.stringify(items) } as never,
    })

    const first = await ensureOrderForPaymentIntent({ payload, paymentIntent })
    expect(first.created).toBe(true)
    createdOrders.push(first.orderId as number)

    const second = await ensureOrderForPaymentIntent({ payload, paymentIntent })
    expect(second.created).toBe(false)
    expect(second.reason).toMatch(/already exists/i)
    expect(second.orderId).toBe(first.orderId)

    // The decisive assertion: stock moved once, not twice.
    expect(await inventoryOf(product.id as number)).toBe(8)

    const orders = await payload.find({
      collection: 'orders',
      where: { transactions: { equals: second.transactionId } },
    })
    expect(orders.totalDocs).toBe(1)
  })

  it('refuses to build an order with no line items anywhere', async () => {
    const piId = `pi_${uniq()}`
    await makeTransaction({ status: 'pending', stripe: { paymentIntentID: piId } })

    const result = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(piId),
    })
    expect(result.created).toBe(false)
    expect(result.reason).toMatch(/no line items/i)
  })

  it('falls back to the transaction items when metadata is truncated', async () => {
    // Stripe caps metadata values at 500 chars, so a big cart loses its snapshot.
    const product = await makeProduct(10)
    const piId = `pi_${uniq()}`

    await makeTransaction({
      status: 'pending',
      items: [{ product: product.id, quantity: 1 }],
      stripe: { paymentIntentID: piId },
    })

    const result = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(piId, { metadata: {} as never }),
    })

    expect(result.created).toBe(true)
    createdOrders.push(result.orderId as number)
    expect(await inventoryOf(product.id as number)).toBe(9)
  })

  it('rejects malformed metadata rather than throwing', async () => {
    const piId = `pi_${uniq()}`
    await makeTransaction({ status: 'pending', stripe: { paymentIntentID: piId } })

    const result = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(piId, {
        metadata: { cartItemsSnapshot: '{not json' } as never,
      }),
    })
    expect(result.created).toBe(false)
    expect(result.reason).toMatch(/not valid JSON/i)
  })
})

describe('event ledger idempotency', () => {
  it('rejects a duplicate event id at the database level', async () => {
    const eventId = `evt_${uniq()}`

    const first = await payload.create({
      collection: 'stripe-events',
      data: { eventId, type: 'payment_intent.succeeded', status: 'received' } as never,
    })
    createdEvents.push(first.id as number)

    // This unique-constraint failure IS the idempotency lock the handlers rely on.
    await expect(
      payload.create({
        collection: 'stripe-events',
        data: { eventId, type: 'payment_intent.succeeded', status: 'received' } as never,
      }),
    ).rejects.toThrow()
  })
})

describe('handlers end-to-end', () => {
  const evt = (type: string, object: unknown, id = `evt_${uniq()}`) =>
    ({ id, type, livemode: false, data: { object } }) as unknown as Stripe.Event

  const reqFor = () => ({ payload }) as never
  const stripeStub = {} as never

  const ledgerFor = async (eventId: string) => {
    const found = await payload.find({
      collection: 'stripe-events',
      where: { eventId: { equals: eventId } },
    })
    const doc = found.docs[0]
    if (doc) createdEvents.push(doc.id as number)
    return doc as Record<string, any> | undefined
  }

  it('payment_intent.succeeded creates the order and records the event', async () => {
    const product = await makeProduct(10)
    const piId = `pi_${uniq()}`
    const items = [{ product: product.id, quantity: 1 }]
    await makeTransaction({ status: 'pending', items, stripe: { paymentIntentID: piId } })

    const event = evt(
      'payment_intent.succeeded',
      intent(piId, { metadata: { cartItemsSnapshot: JSON.stringify(items) } as never }),
    )

    await stripeWebhookHandlers['payment_intent.succeeded']!({
      event,
      req: reqFor(),
      stripe: stripeStub,
    })

    const ledger = await ledgerFor(event.id)
    expect(ledger?.status).toBe('processed')
    expect(await inventoryOf(product.id as number)).toBe(9)

    const orders = await payload.find({
      collection: 'orders',
      where: { amount: { equals: 2500 } },
      sort: '-createdAt',
    })
    expect(orders.totalDocs).toBeGreaterThan(0)
    createdOrders.push(orders.docs[0]!.id as number)
  })

  it('skips a redelivered event without touching stock again', async () => {
    const product = await makeProduct(10)
    const piId = `pi_${uniq()}`
    const items = [{ product: product.id, quantity: 3 }]
    await makeTransaction({ status: 'pending', items, stripe: { paymentIntentID: piId } })

    const event = evt(
      'payment_intent.succeeded',
      intent(piId, { metadata: { cartItemsSnapshot: JSON.stringify(items) } as never }),
    )
    const handler = stripeWebhookHandlers['payment_intent.succeeded']!

    await handler({ event, req: reqFor(), stripe: stripeStub })
    // Same event id — exactly what Stripe does when it does not see a 2xx.
    await handler({ event, req: reqFor(), stripe: stripeStub })
    await handler({ event, req: reqFor(), stripe: stripeStub })

    expect(await inventoryOf(product.id as number)).toBe(7)

    const found = await payload.find({
      collection: 'stripe-events',
      where: { eventId: { equals: event.id } },
    })
    expect(found.totalDocs).toBe(1)
    createdEvents.push(found.docs[0]!.id as number)
  })

  it('payment_intent.payment_failed marks the transaction failed', async () => {
    const piId = `pi_${uniq()}`
    const tx = await makeTransaction({ status: 'pending', stripe: { paymentIntentID: piId } })

    const event = evt(
      'payment_intent.payment_failed',
      intent(piId, {
        status: 'requires_payment_method',
        last_payment_error: { message: 'card_declined' },
      } as never),
    )

    await stripeWebhookHandlers['payment_intent.payment_failed']!({
      event,
      req: reqFor(),
      stripe: stripeStub,
    })

    await ledgerFor(event.id)
    const updated = await payload.findByID({ collection: 'transactions', id: tx.id, depth: 0 })
    expect((updated as Record<string, any>).status).toBe('failed')
  })

  it('charge.refunded restocks and marks refunded on a FULL refund', async () => {
    const product = await makeProduct(10)
    const piId = `pi_${uniq()}`
    const items = [{ product: product.id, quantity: 2 }]
    await makeTransaction({ status: 'pending', items, stripe: { paymentIntentID: piId } })

    // Sell it first so there is something to reverse.
    const sale = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(piId, {
        metadata: { cartItemsSnapshot: JSON.stringify(items) } as never,
      }),
    })
    createdOrders.push(sale.orderId as number)
    expect(await inventoryOf(product.id as number)).toBe(8)

    const event = evt('charge.refunded', {
      id: `ch_${uniq()}`,
      payment_intent: piId,
      amount: 2500,
      amount_refunded: 2500,
    })

    await stripeWebhookHandlers['charge.refunded']!({
      event,
      req: reqFor(),
      stripe: stripeStub,
    })

    await ledgerFor(event.id)
    expect(await inventoryOf(product.id as number)).toBe(10)

    const tx = await payload.findByID({
      collection: 'transactions',
      id: sale.transactionId as number,
      depth: 0,
    })
    expect((tx as Record<string, any>).status).toBe('refunded')
  })

  it('charge.refunded leaves a PARTIAL refund as a live sale and does not restock', async () => {
    const product = await makeProduct(10)
    const piId = `pi_${uniq()}`
    const items = [{ product: product.id, quantity: 2 }]
    await makeTransaction({ status: 'pending', items, stripe: { paymentIntentID: piId } })

    const sale = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(piId, {
        metadata: { cartItemsSnapshot: JSON.stringify(items) } as never,
      }),
    })
    createdOrders.push(sale.orderId as number)

    const event = evt('charge.refunded', {
      id: `ch_${uniq()}`,
      payment_intent: piId,
      amount: 2500,
      amount_refunded: 500, // partial
    })

    await stripeWebhookHandlers['charge.refunded']!({
      event,
      req: reqFor(),
      stripe: stripeStub,
    })

    await ledgerFor(event.id)
    expect(await inventoryOf(product.id as number)).toBe(8) // unchanged

    const tx = await payload.findByID({
      collection: 'transactions',
      id: sale.transactionId as number,
      depth: 0,
    })
    expect((tx as Record<string, any>).status).toBe('succeeded')
  })

  it('records a handler failure in the ledger instead of throwing at Stripe', async () => {
    // A malformed event would throw inside the handler. Stripe must still get a
    // 2xx, or it retries the same broken event for days.
    const event = evt('charge.refunded', { id: 'ch_broken' }) // no payment_intent

    await expect(
      stripeWebhookHandlers['charge.refunded']!({
        event,
        req: reqFor(),
        stripe: stripeStub,
      }),
    ).resolves.not.toThrow()

    const ledger = await ledgerFor(event.id)
    expect(ledger?.status).toBe('processed')
    expect(ledger?.notes).toMatch(/no PaymentIntent/i)
  })
})
