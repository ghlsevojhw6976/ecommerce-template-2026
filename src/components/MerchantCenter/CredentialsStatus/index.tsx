import configPromise from '@payload-config'
import { Banner } from '@payloadcms/ui'
import { getPayload } from 'payload'
import React from 'react'

import {
  ensureMerchantCredentialsLoaded,
  merchantCredentialSource,
  resolveServiceAccount,
} from '@/lib/merchant/keys'

/**
 * Server component: reports whether Merchant API credentials resolve and
 * from WHICH source (admin-stored, env fallback, none) — never any secret
 * material beyond the service account's email, which identifies the key
 * without exposing it.
 */
export const CredentialsStatus: React.FC = async () => {
  const payload = await getPayload({ config: configPromise })
  await ensureMerchantCredentialsLoaded(payload)

  const source = merchantCredentialSource()
  const account = resolveServiceAccount()

  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      {source === 'none' ? (
        <Banner type="info">
          No service-account key configured. Paste the JSON key above — or, for headless deploys,
          set <code>GOOGLE_SERVICE_ACCOUNT_KEY_B64</code> /{' '}
          <code>GOOGLE_APPLICATION_CREDENTIALS</code>. The feed preview below works without it.
        </Banner>
      ) : (
        <Banner type="success">
          Service account <code>{account?.client_email}</code> configured (source:{' '}
          {source === 'admin' ? 'admin, stored encrypted' : 'environment'}).
        </Banner>
      )}
    </div>
  )
}
