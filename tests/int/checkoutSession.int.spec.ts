import type Stripe from 'stripe'
import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import {
  buildLineItems,
  buildSessionParams,
  METADATA_VALUE_LIMIT,
  sessionShippingToPostal,
} from '@/lib/stripe/checkoutSession'
import { fulfillCheckoutSession } from '@/lib/stripe/fulfillSession'

/**
 * The hosted-Checkout pipeline, pinned at its three joints:
 *
 *  1. The session params Stripe receives — money stays integer cents, the
 *     snapshot respects the 500-char metadata cap by OMISSION not truncation,
 *     and the success_url carries the {CHECKOUT_SESSION_ID} template.
 *  2. The basil-era field mapping for the Stripe-collected address.
 *  3. Fulfilment — order created once no matter how many messengers arrive,
 *     stock decremented, cart marked purchased, guest email backfilled.
 */

const ORIGIN = 'https://shop.example.com'

describe('buildLineItems', () => {
  it('passes integer cents through untouched — no unit conversion', () => {
    const [item] = buildLineItems([{ title: 'Mixer', priceInUSD: 49999, quantity: 2 }])
    expect(item!.price_data!.unit_amount).toBe(49999)
    expect(item!.price_data!.currency).toBe('usd')
    expect(item!.quantity).toBe(2)
    expect(item!.price_data!.product_data!.name).toBe('Mixer')
  })

  it('only includes images when a URL was provided', () => {
    const [withImage, without] = buildLineItems([
      { title: 'A', priceInUSD: 100, quantity: 1, imageUrl: 'https://x.test/a.jpg' },
      { title: 'B', priceInUSD: 100, quantity: 1 },
    ])
    expect(withImage!.price_data!.product_data!.images).toEqual(['https://x.test/a.jpg'])
    expect(without!.price_data!.product_data!.images).toBeUndefined()
  })
})

describe('buildSessionParams', () => {
  const base = {
    lineItems: buildLineItems([{ title: 'Mixer', priceInUSD: 49999, quantity: 1 }]),
    origin: ORIGIN,
    cartID: 42,
    itemsSnapshot: [{ product: 7, quantity: 1 }],
  }

  it('targets the hosted page: no ui_mode, success_url with the session-id template, cancel_url back to review', () => {
    const params = buildSessionParams(base)
    expect('ui_mode' in params).toBe(false)
    expect(params.success_url).toBe(
      `${ORIGIN}/checkout/confirm-order?session_id={CHECKOUT_SESSION_ID}`,
    )
    expect(params.cancel_url).toBe(`${ORIGIN}/checkout`)
    expect(params.mode).toBe('payment')
  })

  it('has Stripe collect the US delivery address and phone', () => {
    const params = buildSessionParams(base)
    expect(params.shipping_address_collection?.allowed_countries).toEqual(['US'])
    expect(params.phone_number_collection?.enabled).toBe(true)
  })

  it('renders free shipping as an explicit $0 option with the DDP note', () => {
    const params = buildSessionParams(base)
    const rate = params.shipping_options?.[0]?.shipping_rate_data
    expect(rate?.fixed_amount?.amount).toBe(0)
    // Stripe types the slot as emptyable ('' | {message}) — narrow first.
    const shippingText = params.custom_text?.shipping_address
    expect(typeof shippingText === 'object' ? shippingText?.message : '').toMatch(/duties/i)
  })

  it('prefills the email only when known', () => {
    expect(buildSessionParams(base).customer_email).toBeUndefined()
    expect(
      buildSessionParams({ ...base, customerEmail: 'a@b.co' }).customer_email,
    ).toBe('a@b.co')
  })

  it('carries the cart contract in payment_intent metadata', () => {
    const params = buildSessionParams(base)
    expect(params.payment_intent_data?.metadata?.cartID).toBe('42')
    expect(params.payment_intent_data?.metadata?.cartItemsSnapshot).toBe(
      JSON.stringify(base.itemsSnapshot),
    )
  })

  it('OMITS an oversized snapshot instead of truncating it', () => {
    const bigSnapshot = Array.from({ length: 40 }, (_, i) => ({
      product: 100000 + i,
      variant: 200000 + i,
      quantity: 3,
    }))
    expect(JSON.stringify(bigSnapshot).length).toBeGreaterThan(METADATA_VALUE_LIMIT)

    const params = buildSessionParams({ ...base, itemsSnapshot: bigSnapshot })
    expect(params.payment_intent_data?.metadata?.cartItemsSnapshot).toBeUndefined()
    // cartID still present — the fallback path rebuilds from the transaction.
    expect(params.payment_intent_data?.metadata?.cartID).toBe('42')
  })
})

describe('sessionShippingToPostal (basil field shapes)', () => {
  const session = {
    collected_information: {
      shipping_details: {
        name: 'Mary Jo Smith',
        address: {
          line1: '411 W Ontario St',
          line2: 'Suite 300',
          city: 'Chicago',
          state: 'IL',
          postal_code: '60654',
          country: 'US',
        },
      },
    },
    customer_details: { email: 'mj@example.com', phone: '+13125550142' },
  } as unknown as Stripe.Checkout.Session

  it('maps the collected address including a compound first name', () => {
    const postal = sessionShippingToPostal(session)
    expect(postal).toMatchObject({
      firstName: 'Mary Jo',
      lastName: 'Smith',
      addressLine1: '411 W Ontario St',
      addressLine2: 'Suite 300',
      city: 'Chicago',
      state: 'IL',
      postalCode: '60654',
      country: 'US',
      phone: '+13125550142',
    })
  })

  it('returns undefined when no address was collected', () => {
    expect(
      sessionShippingToPostal({
        collected_information: null,
        customer_details: null,
      } as unknown as Stripe.Checkout.Session),
    ).toBeUndefined()
  })
})

describe('fulfillCheckoutSession', () => {
  let payload: Payload
  const created: { collection: string; id: number | string }[] = []
  const track = (collection: string, id: number | string) => created.push({ collection, id })

  let productId: number
  let cartId: number
  let transactionId: number

  const SESSION_ID = `cs_test_fulfill_${Date.now()}`
  const PI_ID = `pi_test_fulfill_${Date.now()}`

  // Mirrors what buildSessionParams puts on the real PaymentIntent: the
  // cartID is how ensureOrder marks the cart purchased.
  const paymentIntent = () =>
    ({
      id: PI_ID,
      object: 'payment_intent',
      status: 'succeeded',
      amount: 49999,
      currency: 'usd',
      metadata: { cartID: String(cartId) },
    }) as unknown as Stripe.PaymentIntent

  const paidSession = () =>
    ({
      id: SESSION_ID,
      object: 'checkout.session',
      payment_status: 'paid',
      // Expanded PI object — fulfilment must not need a network call.
      payment_intent: paymentIntent(),
      collected_information: {
        shipping_details: {
          name: 'Audit Tester',
          address: {
            line1: '411 W Ontario St',
            city: 'Chicago',
            state: 'IL',
            postal_code: '60654',
            country: 'US',
          },
        },
      },
      customer_details: { email: 'guest-fulfill@test.com', phone: '+13125550142' },
    }) as unknown as Stripe.Checkout.Session

  // fulfil never touches this when the PI arrives expanded — a throwing stub
  // proves it.
  const stripeStub = {
    paymentIntents: {
      retrieve: () => {
        throw new Error('unexpected network call')
      },
    },
  } as unknown as Stripe

  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Fulfilment Test Mixer',
        slug: `fulfil-test-${Date.now()}`,
        inventory: 5,
        priceInUSDEnabled: true,
        priceInUSD: 49999,
        _status: 'published',
      } as never,
    })
    productId = product.id as number
    track('products', productId)

    const cart = await payload.create({
      collection: 'carts',
      data: {
        items: [{ product: productId, quantity: 1 }],
        currency: 'USD',
      } as never,
    })
    cartId = cart.id as number
    track('carts', cartId)

    const transaction = await payload.create({
      collection: 'transactions',
      data: {
        amount: 49999,
        currency: 'USD',
        cart: cartId,
        items: [{ product: productId, quantity: 1 }],
        paymentMethod: 'stripe',
        status: 'pending',
        stripe: { checkoutSessionID: SESSION_ID },
      } as never,
    })
    transactionId = transaction.id as number
    track('transactions', transactionId)
  })

  afterAll(async () => {
    // Orders created by the test are found via the transaction link.
    const tx = (await payload
      .findByID({ collection: 'transactions', id: transactionId, depth: 0 })
      .catch(() => null)) as Record<string, any> | null
    if (tx?.order) track('orders', typeof tx.order === 'object' ? tx.order.id : tx.order)

    for (const { collection, id } of created.reverse()) {
      await payload.delete({ collection: collection as never, id }).catch(() => {})
    }
  })

  it('refuses an unpaid session (async method still settling)', async () => {
    const unpaid = { ...paidSession(), payment_status: 'unpaid' } as Stripe.Checkout.Session
    const result = await fulfillCheckoutSession({ payload, stripe: stripeStub, session: unpaid })
    expect(result.created).toBe(false)
    expect(result.reason).toMatch(/not paid/i)
  })

  it('creates the order, stamps the transaction, decrements stock, backfills the guest email', async () => {
    const result = await fulfillCheckoutSession({
      payload,
      stripe: stripeStub,
      session: paidSession(),
    })

    expect(result.created).toBe(true)
    expect(result.orderId).toBeTruthy()
    expect(result.dispatchable).toBe(true)

    const tx = (await payload.findByID({
      collection: 'transactions',
      id: transactionId,
      depth: 0,
    })) as Record<string, any>

    expect(tx.stripe?.paymentIntentID).toBe(PI_ID)
    expect(tx.stripe?.checkoutSessionID).toBe(SESSION_ID)
    expect(tx.customerEmail).toBe('guest-fulfill@test.com')
    expect(tx.shippingAddress?.addressLine1).toBe('411 W Ontario St')
    expect(tx.status).toBe('succeeded')

    const product = (await payload.findByID({
      collection: 'products',
      id: productId,
      depth: 0,
    })) as Record<string, any>
    expect(product.inventory).toBe(4)

    const cart = (await payload.findByID({
      collection: 'carts',
      id: cartId,
      depth: 0,
    })) as Record<string, any>
    expect(cart.purchasedAt).toBeTruthy()
  })

  it('is idempotent — every later messenger converges on the same order', async () => {
    const first = (await payload.findByID({
      collection: 'transactions',
      id: transactionId,
      depth: 0,
    })) as Record<string, any>
    const orderId = typeof first.order === 'object' ? first.order.id : first.order

    const again = await fulfillCheckoutSession({
      payload,
      stripe: stripeStub,
      session: paidSession(),
    })

    expect(again.created).toBe(false)
    expect(String(again.orderId)).toBe(String(orderId))

    // Stock was NOT decremented twice.
    const product = (await payload.findByID({
      collection: 'products',
      id: productId,
      depth: 0,
    })) as Record<string, any>
    expect(product.inventory).toBe(4)
  })

  it('skips sessions this shop never created', async () => {
    const foreign = { ...paidSession(), id: 'cs_test_foreign_123' } as Stripe.Checkout.Session
    const result = await fulfillCheckoutSession({ payload, stripe: stripeStub, session: foreign })
    expect(result.created).toBe(false)
    expect(result.transactionFound).toBe(false)
  })
})
