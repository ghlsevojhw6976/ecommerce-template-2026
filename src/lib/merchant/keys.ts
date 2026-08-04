import type { Payload } from 'payload'

import fs from 'fs'

import { open } from '@/lib/crypto/secretBox'

/**
 * Google Merchant service-account resolution — the third instance of the
 * credentials pattern (stripe/keys.ts, email/keys.ts):
 *
 *   1. Admin — Settings → Google Merchant Center, the JSON pasted into a
 *      write-only field and stored AES-256-GCM sealed
 *   2. Environment — GOOGLE_SERVICE_ACCOUNT_KEY_B64 (hosted) or
 *      GOOGLE_APPLICATION_CREDENTIALS (path), for headless deploys
 *
 * Owner decision 2026-08-03 superseding "Google keys are env-only": the
 * original decision explicitly permitted an admin field once it got the
 * same write-only + encryption treatment as the Stripe keys — this is that
 * treatment. A DB dump still reveals ciphertext only.
 */

export type ServiceAccount = {
  client_email: string
  private_key: string
  project_id?: string
}

export type MerchantCredentialSource = 'admin' | 'env' | 'none'

type MerchantCache = {
  loaded: boolean
  loadedAt: number
  payload?: Payload
  refreshPromise?: Promise<void>
  serviceAccount?: ServiceAccount
  source: MerchantCredentialSource
}

const CACHE_TTL_MS = 30_000

const globalStore = globalThis as unknown as { __merchantCredentialCache?: MerchantCache }

const cache = (): MerchantCache => {
  if (!globalStore.__merchantCredentialCache) {
    globalStore.__merchantCredentialCache = { loaded: false, loadedAt: 0, source: 'none' }
  }
  return globalStore.__merchantCredentialCache
}

export const parseServiceAccount = (raw: string | null | undefined): ServiceAccount | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.client_email === 'string' &&
      typeof parsed.private_key === 'string'
    ) {
      return parsed as ServiceAccount
    }
  } catch {
    /* not JSON */
  }
  return null
}

const envServiceAccount = (): ServiceAccount | null => {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64?.trim()
  if (b64) {
    try {
      return parseServiceAccount(Buffer.from(b64, 'base64').toString('utf8'))
    } catch {
      return null
    }
  }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  if (path) {
    try {
      return parseServiceAccount(fs.readFileSync(path, 'utf8'))
    } catch {
      return null
    }
  }
  return null
}

export const applyMerchantSettingsDoc = (doc: Record<string, any> | null | undefined): void => {
  const store = cache()
  store.loaded = true
  store.loadedAt = Date.now()

  const sealed = doc?.credentials?.serviceAccountJsonEnc
  const adminAccount = parseServiceAccount(open(sealed))

  if (adminAccount) {
    store.serviceAccount = adminAccount
    store.source = 'admin'
    return
  }

  const envAccount = envServiceAccount()
  store.serviceAccount = envAccount ?? undefined
  store.source = envAccount ? 'env' : 'none'
}

export const loadMerchantCredentials = async (payload: Payload): Promise<void> => {
  const store = cache()
  store.payload = payload
  try {
    const doc = await payload.findGlobal({
      slug: 'merchant-center',
      depth: 0,
      overrideAccess: true,
    })
    applyMerchantSettingsDoc(doc as Record<string, any>)
  } catch {
    applyMerchantSettingsDoc(null)
  }
}

export const ensureMerchantCredentialsLoaded = async (payload?: Payload): Promise<void> => {
  const store = cache()
  const stale = !store.loaded || Date.now() - store.loadedAt > CACHE_TTL_MS
  if (!stale) return
  const client = payload ?? store.payload
  if (!client) return
  if (!store.refreshPromise) {
    store.refreshPromise = loadMerchantCredentials(client).finally(() => {
      store.refreshPromise = undefined
    })
  }
  await store.refreshPromise
}

export const resolveServiceAccount = (): ServiceAccount | undefined => cache().serviceAccount
export const merchantCredentialSource = (): MerchantCredentialSource => cache().source
