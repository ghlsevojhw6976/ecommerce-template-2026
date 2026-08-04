import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type Stripe from 'stripe'

import { isDispatchable } from '@/fields/postalAddress'
import { toStripeShipping } from '@/lib/stripe/enrichTransaction'
import { ensureOrderForPaymentIntent } from '@/lib/stripe/ensureOrder'

/**
 * The dispatch address is the one piece of order data that, if lost, makes the
 * order unfulfillable — you have the customer's money and nowhere to send the
 * goods. The plugin left it only in Stripe metadata; these pin the fix.
 */

let payload: Payload
const createdTransactions: number[] = []
const createdOrders: number[] = []
const createdProducts: number[] = []

const uniq = () => Math.random().toString(36).slice(2, 10)

const ADDRESS = {
  firstName: 'Jan',
  lastName: 'de Vries',
  addressLine1: 'Prinsengracht 263',
  addressLine2: 'Flat 4',
  city: 'Amsterdam',
  postalCode: '1016 GV',
  country: 'NL',
  phone: '+31600000000',
}

const makeProduct = async () => {
  const doc = await payload.create({
    collection: 'products',
    data: {
      title: `addr-test-${uniq()}`,
      fulfilment: 'direct',
      priceInUSD: 2500,
      inventory: 10,
      _status: 'published',
    } as never,
  })
  createdProducts.push(doc.id as number)
  return doc
}

const intent = (id: string, metadata: Record<string, string> = {}) =>
  ({
    id,
    object: 'payment_intent',
    status: 'succeeded',
    amount: 2500,
    currency: 'usd',
    metadata,
  }) as unknown as Stripe.PaymentIntent

describe('isDispatchable', () => {
  it('accepts an address with line1, city, postcode and country', () => {
    expect(isDispatchable(ADDRESS)).toBe(true)
  })

  it('rejects addresses missing any part needed to actually ship', () => {
    expect(isDispatchable({ ...ADDRESS, addressLine1: undefined })).toBe(false)
    expect(isDispatchable({ ...ADDRESS, city: undefined })).toBe(false)
    expect(isDispatchable({ ...ADDRESS, postalCode: undefined })).toBe(false)
    expect(isDispatchable({ ...ADDRESS, country: undefined })).toBe(false)
    expect(isDispatchable(undefined)).toBe(false)
    expect(isDispatchable(null)).toBe(false)
  })

  it('does not treat a name-only address as shippable', () => {
    expect(isDispatchable({ firstName: 'Jan', lastName: 'de Vries' })).toBe(false)
  })
})

describe('toStripeShipping', () => {
  it('maps our field names onto Stripe’s', () => {
    const shipping = toStripeShipping(ADDRESS)
    expect(shipping).toMatchObject({
      name: 'Jan de Vries',
      phone: '+31600000000',
      address: {
        line1: 'Prinsengracht 263',
        line2: 'Flat 4',
        city: 'Amsterdam',
        postal_code: '1016 GV',
        country: 'NL',
      },
    })
  })

  it('drops a country that is not ISO alpha-2, which Stripe would reject', () => {
    const shipping = toStripeShipping({ ...ADDRESS, country: 'Netherlands' })
    expect(shipping?.address).not.toHaveProperty('country')
  })

  it('uppercases the country code', () => {
    expect(toStripeShipping({ ...ADDRESS, country: 'nl' })?.address.country).toBe('NL')
  })

  it('falls back to company, then to the supplied name, when there is no person', () => {
    expect(
      toStripeShipping({ ...ADDRESS, firstName: undefined, lastName: undefined, company: 'Acme' })
        ?.name,
    ).toBe('Acme')
    expect(
      toStripeShipping(
        { ...ADDRESS, firstName: undefined, lastName: undefined },
        'buyer@example.com',
      )?.name,
    ).toBe('buyer@example.com')
  })

  it('returns null when Stripe would reject it — no line1 or no name', () => {
    expect(toStripeShipping({ ...ADDRESS, addressLine1: undefined })).toBeNull()
    expect(toStripeShipping({ addressLine1: 'x' })).toBeNull()
    expect(toStripeShipping(undefined)).toBeNull()
  })
})

describe('order dispatch address', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  afterAll(async () => {
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

  const makeTransaction = async (data: Record<string, unknown>) => {
    const doc = await payload.create({
      collection: 'transactions',
      data: {
        paymentMethod: 'stripe',
        amount: 2500,
        currency: 'USD',
        customerEmail: 'buyer@example.com',
        status: 'pending',
        ...data,
      } as never,
      // The enrichment hook calls Stripe; skip it here so these stay offline.
      context: { skipStripeEnrichment: true },
    })
    createdTransactions.push(doc.id as number)
    return doc
  }

  it('takes the address from PaymentIntent metadata when present', async () => {
    const product = await makeProduct()
    const piId = `pi_${uniq()}`
    const items = [{ product: product.id, quantity: 1 }]
    await makeTransaction({ items, stripe: { paymentIntentID: piId } })

    const result = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(piId, {
        cartItemsSnapshot: JSON.stringify(items),
        shippingAddress: JSON.stringify(ADDRESS),
      }),
    })

    expect(result.created).toBe(true)
    expect(result.dispatchable).toBe(true)
    createdOrders.push(result.orderId as number)

    const order = await payload.findByID({
      collection: 'orders',
      id: result.orderId as number,
      depth: 0,
    })
    expect((order as Record<string, any>).shippingAddress).toMatchObject({
      addressLine1: 'Prinsengracht 263',
      city: 'Amsterdam',
      postalCode: '1016 GV',
      country: 'NL',
    })
  })

  it('falls back to the stored transaction address when metadata is gone', async () => {
    // The whole point of persisting it: metadata is capped at 500 chars and is
    // not a database. This is the case that used to lose the address entirely.
    const product = await makeProduct()
    const piId = `pi_${uniq()}`
    const items = [{ product: product.id, quantity: 1 }]
    await makeTransaction({
      items,
      shippingAddress: ADDRESS,
      stripe: { paymentIntentID: piId },
    })

    const result = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(piId, { cartItemsSnapshot: JSON.stringify(items) }),
    })

    expect(result.created).toBe(true)
    expect(result.dispatchable).toBe(true)
    createdOrders.push(result.orderId as number)

    const order = await payload.findByID({
      collection: 'orders',
      id: result.orderId as number,
      depth: 0,
    })
    expect((order as Record<string, any>).shippingAddress?.city).toBe('Amsterdam')
  })

  it('falls back to the billing address when no shipping address exists', async () => {
    const product = await makeProduct()
    const piId = `pi_${uniq()}`
    const items = [{ product: product.id, quantity: 1 }]
    await makeTransaction({
      items,
      billingAddress: ADDRESS,
      stripe: { paymentIntentID: piId },
    })

    const result = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(piId, { cartItemsSnapshot: JSON.stringify(items) }),
    })

    expect(result.created).toBe(true)
    expect(result.dispatchable).toBe(true)
    createdOrders.push(result.orderId as number)
  })

  it('still creates the order when no address exists anywhere, but flags it', async () => {
    // The money is already taken — refusing to record the order would be worse.
    // It must be visible as unfulfillable instead.
    const product = await makeProduct()
    const piId = `pi_${uniq()}`
    const items = [{ product: product.id, quantity: 1 }]
    await makeTransaction({ items, stripe: { paymentIntentID: piId } })

    const result = await ensureOrderForPaymentIntent({
      payload,
      paymentIntent: intent(piId, { cartItemsSnapshot: JSON.stringify(items) }),
    })

    expect(result.created).toBe(true)
    expect(result.dispatchable).toBe(false)
    expect(result.reason).toMatch(/cannot be dispatched/i)
    createdOrders.push(result.orderId as number)
  })
})
