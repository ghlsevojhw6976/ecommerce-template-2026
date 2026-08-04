import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { getStripeMode, maskKey } from '@/lib/stripe/client'
import { mapIntentStatus } from '@/lib/stripe/reconcile'
import { refundTransaction } from '@/lib/stripe/actions'

/**
 * The refund guards run BEFORE any call to Stripe, so they are testable
 * without network or real keys. They are the last thing standing between a
 * mis-click and real money, so each one is pinned.
 */

let payload: Payload
const created: number[] = []

const makeTransaction = async (data: Record<string, unknown>) => {
  const doc = await payload.create({
    collection: 'transactions',
    data: {
      paymentMethod: 'stripe',
      amount: 5000,
      currency: 'USD',
      ...data,
    } as never,
  })
  created.push(doc.id as number)
  return doc
}

describe('stripe client helpers', () => {
  it('never leaks a full secret key', () => {
    const masked = maskKey('sk_test_51ABCDEFghijklmnopqrstuvwxyz0123456789')
    expect(masked).not.toContain('ghijklmnop')
    expect(masked).toContain('…')
    expect(masked.startsWith('sk_test')).toBe(true)
  })

  it('masks short and missing keys without throwing', () => {
    expect(maskKey(undefined)).toBe('—')
    expect(maskKey('sk_test')).toBe('••••')
  })

  it('derives mode from the key prefix, not a network call', () => {
    const original = process.env.STRIPE_SECRET_KEY
    // Full-shaped fakes: keys at placeholder length (`sk_live_abc`) are
    // deliberately treated as NOT configured, so they would read as 'unset'.
    process.env.STRIPE_SECRET_KEY = 'sk_live_51FAKEFAKEFAKEFAKEFAKE'
    expect(getStripeMode()).toBe('live')
    process.env.STRIPE_SECRET_KEY = 'sk_test_51FAKEFAKEFAKEFAKEFAKE'
    expect(getStripeMode()).toBe('test')
    delete process.env.STRIPE_SECRET_KEY
    expect(getStripeMode()).toBe('unset')
    process.env.STRIPE_SECRET_KEY = original
  })

  it('treats the .env.example placeholder prefixes as unset', () => {
    const original = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk_test_'
    expect(getStripeMode()).toBe('unset')
    process.env.STRIPE_SECRET_KEY = original
  })
})

describe('mapIntentStatus', () => {
  it('maps Stripe payment intent statuses onto our transaction statuses', () => {
    expect(mapIntentStatus('succeeded')).toBe('succeeded')
    expect(mapIntentStatus('canceled')).toBe('cancelled') // note the spelling flip
    expect(mapIntentStatus('processing')).toBe('pending')
    expect(mapIntentStatus('requires_payment_method')).toBe('pending')
    expect(mapIntentStatus('requires_capture')).toBe('pending')
  })

  it('falls back to pending for unknown statuses rather than guessing success', () => {
    expect(mapIntentStatus('some_future_status')).toBe('pending')
  })
})

describe('refundTransaction guards', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY

  beforeAll(async () => {
    // A full-shaped fake key, because getStripe() treats the bare `sk_test_`
    // placeholder from .env.example as UNSET (that is production behaviour we
    // want: a copied-verbatim .env must not report itself as configured). The
    // guards under test reject before any network call, so the key's value is
    // never actually used against Stripe.
    process.env.STRIPE_SECRET_KEY = 'sk_test_51FAKEFAKEFAKEFAKEFAKEFAKE'
    payload = await getPayload({ config: await config })
  })

  afterAll(async () => {
    process.env.STRIPE_SECRET_KEY = originalKey
    for (const id of created) {
      await payload.delete({ collection: 'transactions', id }).catch(() => {})
    }
  })

  it('refuses when there is no Stripe payment intent', async () => {
    const tx = await makeTransaction({ status: 'succeeded' })
    const result = await refundTransaction({ payload, transactionId: tx.id })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/no Stripe payment intent/i)
  })

  it('refuses to refund a pending transaction', async () => {
    const tx = await makeTransaction({
      status: 'pending',
      stripe: { paymentIntentID: 'pi_test_123' },
    })
    const result = await refundTransaction({ payload, transactionId: tx.id })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/only succeeded/i)
  })

  it('refuses to refund twice', async () => {
    const tx = await makeTransaction({
      status: 'refunded',
      stripe: { paymentIntentID: 'pi_test_123' },
    })
    const result = await refundTransaction({ payload, transactionId: tx.id })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/already marked refunded/i)
  })

  it('refuses a partial refund larger than the amount charged', async () => {
    const tx = await makeTransaction({
      status: 'succeeded',
      amount: 5000,
      stripe: { paymentIntentID: 'pi_test_123' },
    })
    const result = await refundTransaction({
      payload,
      transactionId: tx.id,
      amountInMinorUnits: 5001,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/exceeds the charged amount/i)
  })

  it('refuses zero, negative and fractional refund amounts', async () => {
    const tx = await makeTransaction({
      status: 'succeeded',
      amount: 5000,
      stripe: { paymentIntentID: 'pi_test_123' },
    })

    for (const amount of [0, -100, 12.5]) {
      const result = await refundTransaction({
        payload,
        transactionId: tx.id,
        amountInMinorUnits: amount,
      })
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/positive whole number/i)
    }
  })
})
