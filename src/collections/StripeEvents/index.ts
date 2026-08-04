import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/**
 * Ledger of every Stripe webhook event we have seen.
 *
 * Serves three jobs:
 *
 * 1. **Idempotency.** Stripe retries a webhook until it gets a 2xx, and will
 *    happily deliver the same event more than once. `eventId` is unique, so a
 *    duplicate delivery fails the insert and we skip the work instead of
 *    creating a second order or issuing a second refund.
 *
 * 2. **Audit.** When an order looks wrong, the question is always "what did
 *    Stripe actually tell us, and when?" This answers it without digging
 *    through logs that may have rotated.
 *
 * 3. **Recovery.** Failed events stay recorded with their error, so they can be
 *    found and retried rather than being silently lost.
 *
 * Nothing writes here except the webhook pipeline — hence create/update are
 * closed to everyone, including admins.
 */
export const StripeEvents: CollectionConfig = {
  slug: 'stripe-events',
  access: {
    create: () => false,
    delete: adminOnly,
    read: adminOnly,
    update: () => false,
  },
  admin: {
    defaultColumns: ['eventId', 'type', 'status', 'livemode', 'createdAt'],
    group: 'Settings',
    useAsTitle: 'eventId',
    description:
      'Every Stripe webhook event received. Read-only — written by the webhook pipeline.',
  },
  fields: [
    {
      name: 'eventId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'type',
      type: 'text',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'received',
      index: true,
      options: [
        { label: 'Received', value: 'received' },
        { label: 'Processed', value: 'processed' },
        { label: 'Ignored — no handler', value: 'ignored' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: { readOnly: true },
    },
    {
      name: 'livemode',
      type: 'checkbox',
      admin: {
        readOnly: true,
        description: 'False for test-mode events.',
      },
    },
    {
      name: 'error',
      type: 'textarea',
      admin: {
        readOnly: true,
        condition: (_, siblingData) => siblingData?.status === 'failed',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      admin: {
        readOnly: true,
        description: 'What the handler did.',
      },
    },
    {
      name: 'processedAt',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        readOnly: true,
      },
    },
  ],
  timestamps: true,
}
