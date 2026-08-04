import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/access/isAdmin'

/**
 * Suppliers we source dropship products from.
 *
 * A dropship product is one where WE are the merchant of record — the customer
 * checks out on our domain via Stripe — but the supplier ships it. That is what
 * keeps the product eligible for the Google Merchant Center feed, unlike an
 * affiliate product whose checkout happens on someone else's domain.
 *
 * See docs/decisions/2026-07-27-affiliate-products-merchant-center.md
 */
export const Suppliers: CollectionConfig = {
  slug: 'suppliers',
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: isAdmin,
    update: isAdmin,
  },
  admin: {
    defaultColumns: ['name', 'status', 'integration', 'defaultLeadTimeDays'],
    group: 'Commerce',
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Paused', value: 'paused' },
      ],
      admin: {
        description:
          'Pausing a supplier does not unpublish its products — handle stock via inventory sync.',
        position: 'sidebar',
      },
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Fulfilment',
          fields: [
            {
              name: 'defaultLeadTimeDays',
              type: 'number',
              defaultValue: 3,
              min: 0,
              admin: {
                description:
                  'Business days from order to dispatch. Feeds Merchant Center transit time — understating this causes policy issues.',
              },
              required: true,
            },
            {
              name: 'shippingLabel',
              type: 'text',
              admin: {
                description:
                  'Maps to the Merchant Center shipping_label attribute, so per-supplier shipping rates can be configured in Merchant Center.',
              },
            },
            {
              name: 'returnWindowDays',
              type: 'number',
              defaultValue: 14,
              min: 0,
              admin: {
                description: 'EU consumer law minimum is 14 days for distance selling.',
              },
            },
            {
              name: 'shipsFromCountry',
              type: 'text',
              admin: {
                description:
                  'ISO 3166-1 alpha-2, e.g. LT. Affects delivery estimates and customs messaging.',
              },
              maxLength: 2,
            },
          ],
        },
        {
          label: 'Integration',
          fields: [
            {
              name: 'integration',
              type: 'select',
              defaultValue: 'manual',
              options: [
                { label: 'Manual — products entered by hand', value: 'manual' },
                { label: 'CSV / XML feed', value: 'csv' },
                { label: 'API', value: 'api' },
              ],
              required: true,
            },
            {
              name: 'feedUrl',
              type: 'text',
              admin: {
                condition: (_, siblingData) => siblingData?.integration === 'csv',
                description: 'URL of the supplier product/stock feed, polled on a schedule.',
              },
            },
            {
              name: 'apiBaseUrl',
              type: 'text',
              admin: {
                condition: (_, siblingData) => siblingData?.integration === 'api',
              },
            },
            {
              name: 'credentialsEnvVar',
              type: 'text',
              admin: {
                condition: (_, siblingData) => siblingData?.integration !== 'manual',
                description:
                  'NAME of the env var holding this supplier’s API key — never the key itself. Secrets do not belong in the database.',
              },
            },
            {
              name: 'lastSyncedAt',
              type: 'date',
              admin: {
                date: { pickerAppearance: 'dayAndTime' },
                readOnly: true,
              },
            },
          ],
        },
        {
          label: 'Contact',
          fields: [
            { name: 'contactName', type: 'text' },
            { name: 'contactEmail', type: 'email' },
            {
              name: 'orderRoutingEmail',
              type: 'email',
              admin: {
                description: 'Where purchase orders are sent when integration is manual.',
              },
            },
            { name: 'notes', type: 'textarea' },
          ],
        },
      ],
    },
  ],
}
