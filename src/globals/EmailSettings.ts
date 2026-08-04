import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { seal } from '@/lib/crypto/secretBox'
import { applyEmailSettingsDoc } from '@/lib/email/keys'

/**
 * Settings → Email — the shop's own mailbox (plain SMTP + IMAP, no external
 * email API), following the Stripe credentials model exactly:
 *
 * - Passwords are WRITE-ONLY: paste to set/replace, the field reads back
 *   empty. Stored AES-256-GCM encrypted (secretBox, keyed from
 *   PAYLOAD_SECRET); the API never returns the ciphertext fields.
 * - Resolution is admin > env (SMTP_HOST/SMTP_USER/SMTP_PASS…) > none.
 * - The afterChange hook refreshes the in-process keystore, so pasted
 *   credentials work without a restart.
 *
 * The same mailbox powers three things: outbound transactional email
 * (confirmation, tracking, order access, password resets), the admin Mail
 * inbox (IMAP), and reply-from-admin (SMTP + append to the Sent folder).
 *
 * Works with any provider that offers app-password SMTP/IMAP (Zoho,
 * Fastmail, Google Workspace app passwords…). At this shop's volume
 * (~20–30/day) that is well inside every provider's limits — but SPF/DKIM
 * on the sending domain is a launch-checklist item, or confirmations land
 * in spam.
 */
export const EmailSettings: GlobalConfig = {
  slug: 'email-settings',
  label: 'Email',
  access: {
    // Nothing here is public — even the host/username stay admin-only.
    read: adminOnly,
    update: adminOnly,
  },
  admin: {
    group: 'Settings',
    description:
      'The shop mailbox. Sends order confirmations, tracking emails and password resets, and powers the Mail inbox in this admin.',
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data) return data

        // Paste-to-replace: a non-empty value seals into the encrypted
        // column; the plaintext field itself is never persisted.
        if (data.smtp) {
          if (typeof data.smtp.password === 'string' && data.smtp.password.trim()) {
            data.smtp.passwordEnc = seal(data.smtp.password.trim())
          }
          data.smtp.password = null
        }
        if (data.imap) {
          if (typeof data.imap.password === 'string' && data.imap.password.trim()) {
            data.imap.passwordEnc = seal(data.imap.password.trim())
          }
          data.imap.password = null
        }
        if (data.clearStoredCredentials) {
          if (data.smtp) data.smtp.passwordEnc = null
          if (data.imap) data.imap.passwordEnc = null
          data.clearStoredCredentials = false
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        // Refresh the keystore with the FULL doc (hook doc respects field
        // access, so read it back with overrideAccess like the Stripe global).
        try {
          const full = await req.payload.findGlobal({
            slug: 'email-settings',
            depth: 0,
            overrideAccess: true,
            req,
          })
          applyEmailSettingsDoc(full as Record<string, any>)
        } catch {
          applyEmailSettingsDoc(doc)
        }
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'fromName',
          type: 'text',
          admin: {
            width: '50%',
            description: 'Sender name on outgoing email. Falls back to the Company name.',
          },
        },
        {
          name: 'fromAddress',
          type: 'email',
          admin: {
            width: '50%',
            description: 'Falls back to the SMTP username. Must be an address the mailbox may send as.',
          },
        },
      ],
    },
    {
      name: 'replyToAddress',
      type: 'email',
      admin: {
        description:
          'Reply-To header on all outgoing mail. Leave empty to receive replies at the From address. If you ever send as noreply@, set this to the mailbox the Mail view reads — otherwise customer replies vanish.',
      },
    },
    {
      name: 'smtp',
      type: 'group',
      label: 'SMTP (sending)',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'host', type: 'text', admin: { width: '50%', description: 'e.g. smtp.zoho.com' } },
            {
              name: 'port',
              type: 'number',
              defaultValue: 465,
              admin: { width: '25%', description: '465 (TLS) or 587 (STARTTLS).' },
            },
            {
              name: 'secure',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '25%', description: 'On for port 465.' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'username', type: 'text', admin: { width: '50%' } },
            {
              name: 'password',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'Write-only: paste to set or replace, reads back empty. Use an APP password, not the account password.',
              },
            },
          ],
        },
        {
          name: 'passwordEnc',
          type: 'text',
          access: { read: () => false },
          admin: { hidden: true },
        },
      ],
    },
    {
      name: 'imap',
      type: 'group',
      label: 'IMAP (inbox)',
      fields: [
        {
          name: 'sameCredentials',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Use the SMTP username/password for IMAP too (the normal case).' },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'host',
              type: 'text',
              admin: { width: '50%', description: 'e.g. imap.zoho.com. Falls back to the SMTP host.' },
            },
            { name: 'port', type: 'number', defaultValue: 993, admin: { width: '25%' } },
            {
              name: 'sentFolder',
              type: 'text',
              defaultValue: 'Sent',
              admin: { width: '25%', description: 'Where replies are filed.' },
            },
          ],
        },
        {
          type: 'row',
          admin: { condition: (data) => data?.imap?.sameCredentials === false },
          fields: [
            { name: 'username', type: 'text', admin: { width: '50%' } },
            {
              name: 'password',
              type: 'text',
              admin: { width: '50%', description: 'Write-only, like the SMTP password.' },
            },
          ],
        },
        {
          name: 'passwordEnc',
          type: 'text',
          access: { read: () => false },
          admin: { hidden: true },
        },
      ],
    },
    {
      name: 'signature',
      type: 'textarea',
      admin: {
        description:
          'Appended to every reply sent from the Mail view (plain text; line breaks are kept). Not added to automated order emails — those have their own template footer.',
      },
    },
    {
      name: 'clearStoredCredentials',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Tick and save to erase the stored passwords (e.g. after rotating them).',
      },
    },
    {
      name: 'health',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/EmailSettings/HealthPanel#EmailHealthPanel',
        },
      },
    },
  ],
}
