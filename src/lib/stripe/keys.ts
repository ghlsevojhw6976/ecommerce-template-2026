import type { Payload } from 'payload'

import { open } from '@/lib/crypto/secretBox'

/**
 * Where Stripe credentials come from, in precedence order:
 *
 *   1. Admin — Settings → Stripe → API keys, stored encrypted in the database
 *   2. Environment — STRIPE_SECRET_KEY etc., the fallback for automated deploys
 *
 * The admin value wins when both exist, because "manage keys from the admin"
 * is the owner's chosen workflow — env is plumbing, the admin page is the
 * interface. The health panel reports which source is live so a stale env var
 * can never silently shadow what the admin shows.
 *
 * The cache is process-memory, loaded once at Payload init (onInit) and
 * refreshed by the global's afterChange hook — so a key pasted in the admin
 * takes effect on the next request, no restart. Payment code reads it
 * synchronously; nothing on the request path awaits the database.
 *
 * "Usable" deliberately excludes the bare prefixes (`sk_test_`, `pk_test_`,
 * `whsec_`) that .env.example ships as placeholders — a copied-verbatim .env
 * must read as NOT configured, not as a broken key.
 */

export type StripeKeyKind = 'secretKey' | 'publishableKey' | 'webhookSecret'
export type StripeKeySource = 'admin' | 'env' | 'none'

type CredentialCache = {
  loaded: boolean
  loadedAt: number
  /** Kept from onInit so background revalidation can re-read the global. */
  payload?: Payload
  refreshing?: boolean
  secretKey?: string
  publishableKey?: string
  webhookSecret?: string
}

/**
 * On globalThis, NOT module scope — deliberately, and it matters twice:
 *
 * 1. Next bundles the admin routes and the storefront routes separately, and
 *    each bundle gets its own instance of this module. A module-scoped cache
 *    updated by the admin's save hook would leave the storefront bundle
 *    reading its own stale copy forever. globalThis is per-process, which is
 *    the scope we actually mean. (Payload itself survives HMR the same way.)
 * 2. Dev HMR re-evaluates modules; globalThis carries the cache across.
 *
 * Separate PROCESSES (multi-instance deploys) are covered by the TTL below:
 * each process loads at its own onInit, and revalidates in the background
 * when its copy is older than CACHE_TTL_MS. A key change therefore reaches
 * every instance within seconds — with nothing awaited on the request path.
 */
const cache: CredentialCache = ((globalThis as Record<string, unknown>).__stripeCredentialCache ??=
  { loaded: false, loadedAt: 0 }) as CredentialCache

const CACHE_TTL_MS = 30_000

const maybeRevalidate = (): void => {
  if (!cache.payload || cache.refreshing) return
  if (Date.now() - cache.loadedAt < CACHE_TTL_MS) return

  cache.refreshing = true
  void loadStripeCredentials(cache.payload).finally(() => {
    cache.refreshing = false
  })
}

const usable: Record<StripeKeyKind, (value: string) => boolean> = {
  secretKey: (v) => (v.startsWith('sk_') || v.startsWith('rk_')) && v.length > 12,
  publishableKey: (v) => v.startsWith('pk_') && v.length > 20,
  webhookSecret: (v) => v.startsWith('whsec_') && v.length > 10,
}

const ENV_NAMES: Record<StripeKeyKind, string> = {
  secretKey: 'STRIPE_SECRET_KEY',
  publishableKey: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  webhookSecret: 'STRIPE_WEBHOOKS_SIGNING_SECRET',
}

const fromEnv = (kind: StripeKeyKind): string | undefined => {
  const value = process.env[ENV_NAMES[kind]]
  return value && usable[kind](value) ? value : undefined
}

const fromAdmin = (kind: StripeKeyKind): string | undefined => {
  const value = cache[kind]
  return value && usable[kind](value) ? value : undefined
}

const resolve = (kind: StripeKeyKind): string | undefined => {
  maybeRevalidate()
  return fromAdmin(kind) ?? fromEnv(kind)
}

export const resolveStripeSecretKey = (): string | undefined => resolve('secretKey')
export const resolveStripePublishableKey = (): string | undefined => resolve('publishableKey')
export const resolveStripeWebhookSecret = (): string | undefined => resolve('webhookSecret')

export const stripeKeySource = (kind: StripeKeyKind): StripeKeySource => {
  if (fromAdmin(kind)) return 'admin'
  if (fromEnv(kind)) return 'env'
  return 'none'
}

/**
 * Decrypt a stripe-settings global document into the cache. Called from
 * onInit and from the global's afterChange hook with a freshly-read doc.
 */
export const applyStripeCredentialDoc = (doc: unknown): void => {
  const credentials = (doc as { credentials?: Record<string, unknown> } | null)?.credentials

  const publishable = credentials?.publishableKey
  cache.publishableKey = typeof publishable === 'string' && publishable ? publishable : undefined

  cache.secretKey = open(credentials?.secretKeyEnc) ?? undefined
  cache.webhookSecret = open(credentials?.webhookSecretEnc) ?? undefined

  cache.loaded = true
  cache.loadedAt = Date.now()
}

export const loadStripeCredentials = async (payload: Payload): Promise<void> => {
  cache.payload = payload

  try {
    const doc = await payload.findGlobal({
      slug: 'stripe-settings',
      depth: 0,
      overrideAccess: true,
    })
    applyStripeCredentialDoc(doc)
  } catch {
    // A missing global (fresh database) just means nothing stored yet. Mark
    // loaded so resolution settles on env rather than retrying forever.
    cache.loaded = true
    cache.loadedAt = Date.now()
  }
}

/**
 * Await this before reading keys on any server path that has a payload
 * instance. Once loaded it is a no-op, so it costs nothing in steady state —
 * what it buys is independence from boot order: onInit usually loads the
 * cache first, but a hot reload (or any future bundle split) can hand a
 * request to a process/bundle whose cache object is brand new.
 */
export const ensureStripeCredentialsLoaded = async (payload: Payload): Promise<void> => {
  cache.payload ??= payload
  if (!cache.loaded) {
    await loadStripeCredentials(payload)
  }
}

/** Test seam — resets to the not-loaded, nothing-stored state. */
export const resetStripeCredentialCache = (): void => {
  cache.loaded = false
  cache.loadedAt = 0
  cache.secretKey = undefined
  cache.publishableKey = undefined
  cache.webhookSecret = undefined
}
