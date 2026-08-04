import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { open, seal } from '@/lib/crypto/secretBox'
import {
  applyStripeCredentialDoc,
  resetStripeCredentialCache,
  resolveStripeSecretKey,
  resolveStripePublishableKey,
  resolveStripeWebhookSecret,
  stripeKeySource,
} from '@/lib/stripe/keys'

/**
 * Admin-managed Stripe credentials.
 *
 * The three properties that make storing payment keys in the database
 * acceptable, each pinned:
 *
 *  1. What hits the database is ciphertext, never the key.
 *  2. The plaintext input is never persisted (write-only field).
 *  3. Resolution order is admin > env, placeholders count as absent, and
 *     clearing falls back cleanly.
 */

const FAKE_SECRET = 'sk_test_51FAKEFAKEFAKEFAKEFAKEFAKEFAKE'
const FAKE_PUBLISHABLE = 'pk_test_51FAKEFAKEFAKEFAKEFAKEFAKEFAKE'
const FAKE_WEBHOOK = 'whsec_FAKEFAKEFAKEFAKEFAKE'

let payload: Payload

const clearStored = async () => {
  await payload.updateGlobal({
    slug: 'stripe-settings',
    data: { credentials: { clearStoredCredentials: true } } as never,
  })
}

describe('secretBox', () => {
  it('round-trips a value and stores nothing recognisable', () => {
    const box = seal(FAKE_SECRET)
    expect(box).not.toContain(FAKE_SECRET)
    expect(box.startsWith('v1:')).toBe(true)
    expect(open(box)).toBe(FAKE_SECRET)
  })

  it('rejects tampered ciphertext instead of returning garbage', () => {
    const box = seal(FAKE_SECRET)
    const parts = box.split(':')
    // Flip a character in the ciphertext part.
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith('AA') ? 'BB' : 'AA')
    expect(open(parts.join(':'))).toBeNull()
  })

  it('returns null for anything that is not a box', () => {
    expect(open(null)).toBeNull()
    expect(open('')).toBeNull()
    expect(open('not-a-box')).toBeNull()
    expect(open('v2:a:b:c')).toBeNull()
  })
})

describe('stored credentials', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  afterAll(async () => {
    // Leave nothing behind: a stored fake key would poison the env-based
    // expectations of every suite that runs after this one.
    await clearStored()
    resetStripeCredentialCache()
  })

  it('persists ciphertext, never the pasted key', async () => {
    await payload.updateGlobal({
      slug: 'stripe-settings',
      data: {
        credentials: {
          secretKey: FAKE_SECRET,
          publishableKey: FAKE_PUBLISHABLE,
          webhookSecret: FAKE_WEBHOOK,
        },
      } as never,
    })

    const doc = (await payload.findGlobal({
      slug: 'stripe-settings',
      depth: 0,
      overrideAccess: true,
    })) as { credentials?: Record<string, unknown> }

    // Write-only: the plaintext inputs come back empty.
    expect(doc.credentials?.secretKey ?? null).toBeNull()
    expect(doc.credentials?.webhookSecret ?? null).toBeNull()

    // The stored value is our ciphertext format and decrypts to the key.
    const enc = doc.credentials?.secretKeyEnc as string
    expect(enc.startsWith('v1:')).toBe(true)
    expect(enc).not.toContain(FAKE_SECRET)
    expect(open(enc)).toBe(FAKE_SECRET)
  })

  it('resolves admin-stored keys with source=admin', () => {
    // The global afterChange hook refreshed the cache during the update above.
    expect(resolveStripeSecretKey()).toBe(FAKE_SECRET)
    expect(resolveStripePublishableKey()).toBe(FAKE_PUBLISHABLE)
    expect(resolveStripeWebhookSecret()).toBe(FAKE_WEBHOOK)
    expect(stripeKeySource('secretKey')).toBe('admin')
    expect(stripeKeySource('publishableKey')).toBe('admin')
  })

  it('admin key beats a usable env key', () => {
    const original = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk_test_51ENVENVENVENVENVENVENVENV'
    expect(resolveStripeSecretKey()).toBe(FAKE_SECRET)
    expect(stripeKeySource('secretKey')).toBe('admin')
    process.env.STRIPE_SECRET_KEY = original
  })

  it('clearing falls back to env, and placeholder env counts as absent', async () => {
    await clearStored()

    // The test .env carries the bare `sk_test_` placeholder — which must NOT
    // count as configuration.
    expect(resolveStripeSecretKey()).toBeUndefined()
    expect(stripeKeySource('secretKey')).toBe('none')

    const original = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk_test_51ENVENVENVENVENVENVENVENV'
    expect(resolveStripeSecretKey()).toBe('sk_test_51ENVENVENVENVENVENVENVENV')
    expect(stripeKeySource('secretKey')).toBe('env')
    process.env.STRIPE_SECRET_KEY = original
  })

  it('ignores ciphertext sealed under a different secret (wrong PAYLOAD_SECRET)', () => {
    applyStripeCredentialDoc({
      credentials: { secretKeyEnc: 'v1:AAAA:BBBB:CCCC' },
    })
    expect(resolveStripeSecretKey()).toBeUndefined()
  })
})
