import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import {
  applyMerchantSettingsDoc,
  merchantCredentialSource,
  parseServiceAccount,
  resolveServiceAccount,
} from '@/lib/merchant/keys'

/**
 * The Google service-account key follows the Stripe credentials treatment:
 * write-only paste, sealed storage, admin > env > none resolution. These
 * tests pin the seal → resolve roundtrip through the real global.
 */

const FAKE_KEY = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  client_email: 'feed-bot@test-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIfake\n-----END PRIVATE KEY-----\n',
})

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config: await config })
})

afterAll(async () => {
  // Leave the test DB unconfigured, whatever the tests did.
  await payload.updateGlobal({
    slug: 'merchant-center',
    data: { credentials: { clearStoredCredentials: true } } as never,
    overrideAccess: true,
  })
})

describe('parseServiceAccount', () => {
  it('accepts a complete key and rejects fragments', () => {
    expect(parseServiceAccount(FAKE_KEY)?.client_email).toContain('@test-project')
    expect(parseServiceAccount('{"client_email":"x@y.z"}')).toBeNull() // no private_key
    expect(parseServiceAccount('not json')).toBeNull()
    expect(parseServiceAccount('')).toBeNull()
  })
})

describe('admin-stored service account', () => {
  it('seals on save, never persists plaintext, and resolves as source=admin', async () => {
    const saved = await payload.updateGlobal({
      slug: 'merchant-center',
      data: { credentials: { serviceAccountJson: FAKE_KEY } } as never,
      overrideAccess: true,
    })

    // Write-only: the paste field reads back empty…
    expect((saved as Record<string, any>).credentials?.serviceAccountJson ?? null).toBeNull()

    // …and the keystore (refreshed by the afterChange hook) resolves it.
    expect(merchantCredentialSource()).toBe('admin')
    expect(resolveServiceAccount()?.client_email).toBe(
      'feed-bot@test-project.iam.gserviceaccount.com',
    )
  })

  it('clearStoredCredentials erases the key → source falls to env/none', async () => {
    await payload.updateGlobal({
      slug: 'merchant-center',
      data: { credentials: { clearStoredCredentials: true } } as never,
      overrideAccess: true,
    })
    expect(merchantCredentialSource()).not.toBe('admin')
  })

  it('a doc with no sealed key resolves from env or none, never crashes', () => {
    applyMerchantSettingsDoc(null)
    expect(['env', 'none']).toContain(merchantCredentialSource())
  })
})
