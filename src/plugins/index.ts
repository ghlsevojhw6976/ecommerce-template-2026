import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { Field, Plugin } from 'payload'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'

import { postalAddress } from '@/fields/postalAddress'
import { validateProducts } from '@/lib/commerce/validateProducts'
import { dynamicStripeAdapter } from '@/lib/stripe/dynamicAdapter'
import { enrichStripeTransaction } from '@/lib/stripe/enrichTransaction'

import { Page, Product } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'
import { ProductsCollection } from '@/collections/Products'
import { CARRIERS } from '@/lib/email/carriers'
import { sendOrderEmails } from '@/lib/email/orderEmails'
import { adminOrPublishedStatus } from '@/access/adminOrPublishedStatus'
import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'
import { customerOnlyFieldAccess } from '@/access/customerOnlyFieldAccess'
import { isAdmin } from '@/access/isAdmin'
import { isDocumentOwner } from '@/access/isDocumentOwner'

// The "generate" button in the admin's SEO tab. Shop name comes from the
// Company global — the same source as every rendered <title> — so the stored
// meta.title can never carry a stale or foreign brand.
const generateTitle: GenerateTitle<Product | Page> = async ({ doc, req }) => {
  let shopName = 'Your Shop'
  try {
    const company = await req.payload.findGlobal({ slug: 'company', depth: 0 })
    if (typeof company?.name === 'string' && company.name.trim()) shopName = company.name.trim()
  } catch {
    // fall through to the neutral default
  }
  return doc?.title ? `${doc.title} | ${shopName}` : shopName
}

const generateURL: GenerateURL<Product | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formSubmissionOverrides: {
      access: {
        delete: isAdmin,
        read: isAdmin,
        update: isAdmin,
      },
      admin: {
        group: 'Content',
      },
    },
    formOverrides: {
      access: {
        delete: isAdmin,
        // Forms must be PUBLICLY readable — a contact form is rendered to
        // anonymous visitors. With admin-only read, Payload silently returns
        // the bare relationship ID instead of the document, and the block
        // destructures a number into undefined for every key: no fields, no
        // submit label, no error. The form just renders as an empty box.
        //
        // Only the *definition* is public. Submissions stay admin-only via
        // formSubmissionOverrides above, which is where the private data is.
        read: () => true,
        update: isAdmin,
        create: isAdmin,
      },
      admin: {
        group: 'Content',
      },
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })
      },
    },
  }),
  ecommercePlugin({
    access: {
      adminOnlyFieldAccess,
      adminOrPublishedStatus,
      customerOnlyFieldAccess,
      isAdmin,
      isDocumentOwner,
    },
    customers: {
      slug: 'users',
    },
    // US-only, matching SUPPORTED_COUNTRIES in the address form. With exactly
    // one country the plugin auto-defaults new addresses to it, and the 40-country
    // dropdown the template shipped with disappears from the admin too.
    addresses: {
      supportedCountries: [{ label: 'United States', value: 'US' }],
    },
    orders: {
      ordersCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        admin: {
          ...defaultCollection?.admin,
          components: {
            ...(defaultCollection?.admin as { components?: object })?.components,
            // One-click fulfilment-state pills above the list — the queue view.
            beforeListTable: ['@/components/Orders/StatusFilterBar#StatusFilterBar'],
          },
          // The operator's scan order: what needs doing, then payment state,
          // then who/what/when. fulfilmentStatus is the actionable column.
          defaultColumns: [
            'id',
            'fulfilmentStatus',
            'status',
            'trackingNumber',
            'customerEmail',
            'amount',
            'createdAt',
          ],
        },
        hooks: {
          ...defaultCollection?.hooks,
          // Confirmation on create, shipped email on tracking-number change —
          // idempotent via the sentAt stamps. See src/lib/email/orderEmails.ts.
          afterChange: [...(defaultCollection?.hooks?.afterChange ?? []), sendOrderEmails],
        },
        fields: [
          // The plugin's own fields, with a colored pill on the status cell.
          ...defaultCollection.fields.map((field): Field =>
            'name' in field && field.name === 'status'
              ? ({
                  ...field,
                  admin: {
                    ...field.admin,
                    components: {
                      ...(field.admin as { components?: object })?.components,
                      Cell: '@/components/Orders/StatusPill#StatusPill',
                    },
                  },
                } as Field)
              : field,
          ),
          // DERIVED, never hand-set (the feedEligible pattern): what the
          // operator must DO with this order, computed from payment status +
          // tracking. Stored (not afterRead-computed) so the list view can
          // filter and sort on it in SQL.
          {
            name: 'fulfilmentStatus',
            type: 'select',
            index: true,
            options: [
              { label: 'Needs shipment', value: 'needs_shipment' },
              { label: 'Shipped', value: 'shipped' },
              { label: 'Completed', value: 'completed' },
              { label: 'Cancelled', value: 'cancelled' },
              { label: 'Refunded', value: 'refunded' },
            ],
            admin: {
              position: 'sidebar',
              readOnly: true,
              description: 'Computed from payment status and tracking — not editable.',
              components: {
                Cell: '@/components/Orders/StatusPill#StatusPill',
              },
            },
            hooks: {
              beforeChange: [
                ({ data, siblingData, originalDoc }) => {
                  // Partial updates (the email-stamp PATCH, a lone status
                  // change) omit fields — fall back to the stored doc or a
                  // stamp write would silently reset this to needs_shipment.
                  const source = siblingData ?? data ?? {}
                  const status = source.status ?? originalDoc?.status
                  if (status === 'cancelled' || status === 'refunded' || status === 'completed') {
                    return status
                  }
                  const tracking =
                    source.trackingNumber !== undefined
                      ? source.trackingNumber
                      : originalDoc?.trackingNumber
                  return typeof tracking === 'string' && tracking.trim()
                    ? 'shipped'
                    : 'needs_shipment'
                },
              ],
            },
          },
          {
            name: 'accessToken',
            type: 'text',
            unique: true,
            index: true,
            admin: {
              position: 'sidebar',
              readOnly: true,
            },
            hooks: {
              beforeValidate: [
                ({ value, operation }) => {
                  if (operation === 'create' || !value) {
                    return crypto.randomUUID()
                  }
                  return value
                },
              ],
            },
          },
          // ---- Fulfilment ------------------------------------------------
          // Paste the supplier's tracking number and save: the customer gets
          // the shipped email automatically (once per number).
          {
            type: 'row',
            fields: [
              {
                name: 'trackingNumber',
                type: 'text',
                admin: {
                  width: '60%',
                  description: 'Saving a new value emails the customer their tracking link.',
                },
              },
              {
                name: 'carrier',
                type: 'select',
                options: CARRIERS as never,
                admin: { width: '40%' },
              },
            ],
          },
          {
            name: 'shippedAt',
            type: 'date',
            admin: {
              position: 'sidebar',
              readOnly: true,
              description: 'Stamped when a tracking number is first saved.',
            },
            hooks: {
              beforeChange: [
                ({ value, data }) => {
                  if (!value && typeof data?.trackingNumber === 'string' && data.trackingNumber.trim()) {
                    return new Date().toISOString()
                  }
                  return value
                },
              ],
            },
          },
          {
            name: 'confirmationEmailSentAt',
            type: 'date',
            admin: { position: 'sidebar', readOnly: true },
          },
          {
            name: 'trackingEmailSentAt',
            type: 'date',
            admin: { position: 'sidebar', readOnly: true },
          },
        ],
      }),
    },
    transactions: {
      transactionsCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        admin: {
          ...defaultCollection?.admin,
          defaultColumns: ['id', 'status', 'amount', 'customerEmail', 'createdAt'],
        },
        hooks: {
          ...defaultCollection?.hooks,
          afterChange: [
            ...(defaultCollection?.hooks?.afterChange ?? []),
            // Copies the dispatch address out of Stripe metadata into Postgres,
            // and gives Stripe the shipping/customer detail the plugin omits.
            enrichStripeTransaction,
          ],
        },
        fields: [
          ...defaultCollection.fields,
          // The plugin stores billingAddress but not shippingAddress, leaving
          // the dispatch address only in PaymentIntent metadata.
          postalAddress({
            name: 'shippingAddress',
            label: 'Shipping address',
            description:
              'Where this order ships. Copied from the payment on creation — metadata is not a database.',
          }),
          {
            name: 'refund',
            type: 'ui',
            admin: {
              components: {
                Field: '@/components/StripeAdmin/RefundPanel#RefundPanel',
              },
            },
          },
        ],
      }),
    },
    payments: {
      // Keys are resolved per request (admin-stored first, env fallback) so a
      // key pasted in Settings → Stripe applies without a restart.
      paymentMethods: [dynamicStripeAdapter()],
    },
    products: {
      productsCollectionOverride: ProductsCollection,
      // The plugin's default validation never checks variants (its variant
      // branch is nested inside `if (!item.variant)` — dead code). Ours does.
      validation: validateProducts,
    },
  }),
]
