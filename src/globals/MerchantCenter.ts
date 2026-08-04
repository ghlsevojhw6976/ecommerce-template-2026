import crypto from 'crypto'

import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { seal } from '@/lib/crypto/secretBox'
import { applyMerchantSettingsDoc, parseServiceAccount } from '@/lib/merchant/keys'

/**
 * Google Merchant Center control panel.
 *
 * Admin -> Settings -> Google Merchant Center.
 *
 * The service-account key lives HERE since 2026-08-03 (owner decision,
 * superseding env-only) — with the same treatment as the Stripe keys: the
 * paste field is write-only, storage is AES-256-GCM sealed
 * (src/lib/crypto/secretBox.ts, keyed from PAYLOAD_SECRET), and the API
 * never returns the ciphertext. GOOGLE_SERVICE_ACCOUNT_KEY_B64 /
 * GOOGLE_APPLICATION_CREDENTIALS remain as headless-deploy fallbacks
 * (admin > env > none — src/lib/merchant/keys.ts).
 *
 * See docs/decisions/2026-07-27-merchant-api-product-sync.md
 */
export const MerchantCenter: GlobalConfig = {
  slug: 'merchant-center',
  label: 'Google Merchant Center',
  access: {
    read: adminOnly,
    update: adminOnly,
  },
  admin: {
    group: 'Settings',
    components: {
      elements: {
        Description: '@/components/MerchantCenter/SettingsDescription#SettingsDescription',
      },
    },
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data?.credentials) return data
        const credentials = data.credentials

        if (
          typeof credentials.serviceAccountJson === 'string' &&
          credentials.serviceAccountJson.trim()
        ) {
          credentials.serviceAccountJsonEnc = seal(credentials.serviceAccountJson.trim())
        }
        // Write-only: the plaintext never persists.
        credentials.serviceAccountJson = null

        if (credentials.clearStoredCredentials) {
          credentials.serviceAccountJsonEnc = null
          credentials.clearStoredCredentials = false
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        try {
          const full = await req.payload.findGlobal({
            slug: 'merchant-center',
            depth: 0,
            overrideAccess: true,
            req,
          })
          applyMerchantSettingsDoc(full as Record<string, any>)
        } catch {
          applyMerchantSettingsDoc(doc)
        }
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        // ---------------------------------------------------------------
        {
          label: 'Status',
          description: 'What would be sent to Google right now.',
          fields: [
            {
              name: 'feedPreview',
              type: 'ui',
              admin: {
                components: {
                  Field: '@/components/MerchantCenter/FeedPreview#FeedPreview',
                },
              },
            },
            {
              name: 'lastSyncAt',
              type: 'date',
              admin: {
                date: { pickerAppearance: 'dayAndTime' },
                description:
                  'Products expire from Merchant Center after 30 days. A full refresh must run well inside that window.',
                readOnly: true,
              },
            },
            {
              name: 'lastSyncStatus',
              type: 'select',
              options: [
                { label: 'Never run', value: 'never' },
                { label: 'Success', value: 'success' },
                { label: 'Partial — some products failed', value: 'partial' },
                { label: 'Failed', value: 'failed' },
              ],
              defaultValue: 'never',
              admin: { readOnly: true },
            },
            {
              name: 'lastSyncSummary',
              type: 'textarea',
              admin: {
                description: 'Result of the most recent run.',
                readOnly: true,
              },
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Connection',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                description:
                  'Master switch. While off, no scheduled sync runs — the preview below still works.',
              },
            },
            {
              name: 'dryRun',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                description:
                  'Build and validate payloads without sending them to Google. Leave on until a preview has been reviewed against the live catalogue.',
              },
            },
            {
              name: 'merchantAccountId',
              type: 'text',
              admin: {
                description:
                  'Merchant Center account ID — digits only, no "accounts/" prefix.',
              },
            },
            {
              name: 'credentials',
              type: 'group',
              label: 'Service account',
              fields: [
                {
                  name: 'serviceAccountJson',
                  type: 'textarea',
                  validate: (value: unknown) => {
                    if (!value || (typeof value === 'string' && !value.trim())) return true
                    if (typeof value === 'string' && parseServiceAccount(value)) return true
                    return 'Paste the COMPLETE service-account JSON key file (it must contain client_email and private_key). Google Cloud → IAM → Service accounts → Keys → Add key (JSON).'
                  },
                  admin: {
                    description:
                      'Write-only: paste the whole JSON key file to set or replace, reads back empty. Stored encrypted; a database dump reveals ciphertext only.',
                  },
                },
                {
                  name: 'serviceAccountJsonEnc',
                  type: 'text',
                  access: { read: () => false },
                  admin: { hidden: true },
                },
                {
                  name: 'clearStoredCredentials',
                  type: 'checkbox',
                  defaultValue: false,
                  admin: {
                    description: 'Tick and save to erase the stored key (e.g. after rotating it).',
                  },
                },
              ],
            },
            {
              name: 'credentialsStatus',
              type: 'ui',
              admin: {
                components: {
                  Field: '@/components/MerchantCenter/CredentialsStatus#CredentialsStatus',
                },
              },
            },
            {
              name: 'feedToken',
              type: 'text',
              admin: {
                readOnly: true,
                description:
                  'Auto-generated. Your scheduled-fetch feed URL is <your domain>/feed/google-shopping.xml?key=<this token> — add it in Merchant Center under Data sources → Add product source → Scheduled fetch. No Google credentials needed.',
              },
              hooks: {
                beforeValidate: [
                  ({ value }) => value || crypto.randomUUID(),
                ],
              },
            },
            {
              name: 'refreshIntervalDays',
              type: 'number',
              defaultValue: 14,
              min: 1,
              max: 29,
              admin: {
                description:
                  'Full-refresh cadence. Must stay under 30 — Google expires API-uploaded products at 30 days, so a 14-day cadence tolerates one failed run.',
              },
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Export',
          description:
            'Live feed URLs for scheduled fetching, and one-click file downloads — Google Shopping and Facebook/Meta, from the same mapper as the preview.',
          fields: [
            {
              name: 'exportPanel',
              type: 'ui',
              admin: {
                components: {
                  Field: '@/components/MerchantCenter/ExportPanel#ExportPanel',
                },
              },
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Markets',
          description:
            'One entry per country/language you sell into. Each needs its own API data source in Merchant Center.',
          fields: [
            {
              name: 'markets',
              type: 'array',
              labels: { singular: 'Market', plural: 'Markets' },
              admin: {
                initCollapsed: false,
                description:
                  'Products are keyed as contentLanguage~feedLabel~offerId, so these values are part of a product’s identity. Changing one creates new products rather than updating existing ones.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'feedLabel',
                      type: 'text',
                      required: true,
                      admin: {
                        width: '33%',
                        description: 'e.g. LT',
                      },
                    },
                    {
                      name: 'contentLanguage',
                      type: 'text',
                      required: true,
                      admin: {
                        width: '33%',
                        description: 'ISO 639-1, e.g. en',
                      },
                      maxLength: 2,
                    },
                    {
                      name: 'currencyCode',
                      type: 'text',
                      required: true,
                      admin: {
                        width: '34%',
                        description: 'ISO 4217, e.g. EUR',
                      },
                      maxLength: 3,
                    },
                  ],
                },
                {
                  name: 'dataSource',
                  type: 'text',
                  admin: {
                    description:
                      'accounts/{account}/dataSources/{id}. Must be an API-type data source — file-based sources reject API writes. Left blank until created.',
                    readOnly: true,
                  },
                },
                {
                  name: 'active',
                  type: 'checkbox',
                  defaultValue: true,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
