import Stripe from 'stripe'

import { resolveStripeSecretKey } from '@/lib/stripe/keys'

/**
 * Shared Stripe client.
 *
 * The key comes from the keystore (admin-stored first, env fallback — see
 * keys.ts), which also filters out the bare `sk_test_` placeholder that
 * .env.example ships. Returns null when no usable key exists, so the admin
 * panel renders a "not connected" state instead of crashing. Every caller
 * must handle null.
 *
 * The instance is cached PER KEY: when the admin replaces the key, the next
 * call builds a client for the new one instead of quietly reusing the old.
 */

let cached: { key: string; client: Stripe } | null = null

/**
 * Pinned DELIBERATELY, not inherited from the SDK default. Checkout-session
 * parsing depends on version-specific field names — on basil the collected
 * shipping address lives at `session.collected_information.shipping_details`
 * (top-level `shipping_details` was removed 2025-03-31), and the `ui_mode`
 * enum values were renamed in the 2026-03-25 "dahlia" version. An SDK upgrade
 * must not silently shift these under `fulfillSession.ts` and
 * `checkoutSession.ts` — bump this string together with those files.
 */
const STRIPE_API_VERSION = '2025-08-27.basil'

export const getStripe = (): Stripe | null => {
  const key = resolveStripeSecretKey()
  if (!key) return null
  if (!cached || cached.key !== key) {
    cached = { key, client: new Stripe(key, { apiVersion: STRIPE_API_VERSION }) }
  }
  return cached.client
}

/**
 * Live vs test is derived from the key prefix, not from an API call — it must
 * be knowable even when the key is invalid or the network is down. Getting this
 * wrong on screen is how someone issues a real refund thinking they are in test.
 */
export const getStripeMode = (): 'live' | 'test' | 'unset' => {
  const key = resolveStripeSecretKey()
  if (!key) return 'unset'
  if (key.startsWith('sk_live') || key.startsWith('rk_live')) return 'live'
  return 'test'
}

/** Never render a secret. This is for confirming *which* key is loaded. */
export const maskKey = (key?: string): string => {
  if (!key) return '—'
  if (key.length <= 12) return '••••'
  return `${key.slice(0, 7)}…${key.slice(-4)}`
}
