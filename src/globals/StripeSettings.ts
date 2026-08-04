import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { seal } from '@/lib/crypto/secretBox'
import { applyStripeCredentialDoc } from '@/lib/stripe/keys'

/**
 * Stripe operations panel — Admin -> Settings -> Stripe.
 *
 * Credentials can be managed HERE (owner's decision, 2026-07-30 — see the
 * CLAUDE.md decision log; this supersedes the earlier env-only rule). The
 * safeguards that made that acceptable:
 *
 *  - Secret values are WRITE-ONLY. Pasting a key stores it encrypted
 *    (AES-256-GCM keyed off PAYLOAD_SECRET) and the input reads back empty.
 *    No admin session can ever exfiltrate a stored secret — the API returns
 *    nothing for the encrypted fields (field access read: false), and even
 *    the raw database row is ciphertext.
 *  - The publishable key is stored in the clear because it is public by
 *    definition — it ships in the browser bundle of every Stripe shop.
 *  - Env vars still work as a fallback for automated deploys; a stored admin
 *    key takes precedence. The connection panel reports which source is live.
 */
export const StripeSettings: GlobalConfig = {
  slug: 'stripe-settings',
  label: 'Stripe',
  access: {
    read: adminOnly,
    update: adminOnly,
  },
  admin: {
    group: 'Settings',
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        const credentials = data?.credentials as Record<string, unknown> | undefined
        if (!credentials) return data

        if (credentials.clearStoredCredentials) {
          credentials.publishableKey = null
          credentials.secretKeyEnc = null
          credentials.webhookSecretEnc = null
        } else {
          // Paste-to-replace: a non-empty value seals into the encrypted
          // column; an empty input means "keep what is stored".
          if (typeof credentials.secretKey === 'string' && credentials.secretKey.trim()) {
            credentials.secretKeyEnc = seal(credentials.secretKey.trim())
          }
          if (typeof credentials.webhookSecret === 'string' && credentials.webhookSecret.trim()) {
            credentials.webhookSecretEnc = seal(credentials.webhookSecret.trim())
          }
        }

        // The plaintext inputs are never persisted, whatever else happens.
        credentials.secretKey = null
        credentials.webhookSecret = null
        credentials.clearStoredCredentials = false

        return data
      },
    ],
    afterChange: [
      async ({ req }) => {
        // Re-read rather than trusting the hook's doc argument: the argument
        // may already have access-hidden fields stripped, and caching a doc
        // without the encrypted columns would silently wipe live keys.
        const fresh = await req.payload.findGlobal({
          slug: 'stripe-settings',
          depth: 0,
          overrideAccess: true,
          req,
        })
        applyStripeCredentialDoc(fresh)
      },
    ],
  },
  fields: [
    {
      name: 'credentials',
      type: 'group',
      label: 'API keys',
      admin: {
        description:
          'Keys are read from here first, then from environment variables. Secret values are write-only: paste to set or replace, and the field shows empty again after saving. Stored values are encrypted.',
      },
      fields: [
        {
          name: 'publishableKey',
          type: 'text',
          label: 'Publishable key',
          admin: {
            description: 'Starts with pk_. Public by design — used by the checkout page.',
          },
          validate: (value: unknown) => {
            if (!value) return true
            const v = String(value)
            if (!v.startsWith('pk_')) return 'A publishable key starts with pk_.'
            if (v.length <= 20) return 'This looks like a placeholder, not a full key.'
            return true
          },
        },
        {
          name: 'secretKey',
          type: 'text',
          label: 'Secret key',
          admin: {
            description:
              'Starts with sk_ (or rk_ for a restricted key). Write-only — pasting replaces the stored key; leaving it blank keeps it.',
            placeholder: 'Stored keys are never shown. Paste to replace.',
          },
          validate: (value: unknown) => {
            if (!value) return true
            const v = String(value)
            if (!v.startsWith('sk_') && !v.startsWith('rk_'))
              return 'A secret key starts with sk_ or rk_.'
            if (v.length <= 12) return 'This looks like a placeholder, not a full key.'
            return true
          },
        },
        {
          name: 'webhookSecret',
          type: 'text',
          label: 'Webhook signing secret',
          admin: {
            description:
              'Starts with whsec_. Write-only, same as the secret key. From the webhook endpoint settings in the Stripe dashboard (or `pnpm stripe-webhooks` locally).',
            placeholder: 'Stored secrets are never shown. Paste to replace.',
          },
          validate: (value: unknown) => {
            if (!value) return true
            const v = String(value)
            if (!v.startsWith('whsec_')) return 'A webhook signing secret starts with whsec_.'
            if (v.length <= 10) return 'This looks like a placeholder, not a full secret.'
            return true
          },
        },
        {
          name: 'clearStoredCredentials',
          type: 'checkbox',
          label: 'Clear all stored keys on save',
          defaultValue: false,
          admin: {
            description: 'Removes the stored keys; the shop falls back to environment variables.',
          },
        },
        // ── Ciphertext columns ─────────────────────────────────────────────
        // Hidden from the admin UI and unreadable through the API (read access
        // false). Only server code with overrideAccess sees them, and what it
        // sees is still ciphertext until secretBox.open().
        {
          name: 'secretKeyEnc',
          type: 'text',
          access: { read: () => false },
          admin: { hidden: true },
        },
        {
          name: 'webhookSecretEnc',
          type: 'text',
          access: { read: () => false },
          admin: { hidden: true },
        },
      ],
    },
    {
      name: 'connection',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/StripeAdmin/ConnectionStatus#ConnectionStatus',
        },
      },
    },
    {
      name: 'webhookSetup',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/StripeAdmin/WebhookSetup#WebhookSetup',
        },
      },
    },
    {
      name: 'reconciliation',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/StripeAdmin/Reconciliation#Reconciliation',
        },
      },
    },
    {
      name: 'allowRefundsFromAdmin',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'When off, the refund action on transactions is disabled everywhere. Useful if refunds should only ever be issued from the Stripe dashboard.',
      },
    },
    {
      name: 'reconcileLimit',
      type: 'number',
      defaultValue: 100,
      min: 10,
      max: 500,
      admin: {
        description:
          'How many recent transactions each reconciliation run checks. Each one is a Stripe API call, so keep this modest.',
      },
    },
  ],
}
