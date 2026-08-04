import type { Field, Tab } from 'payload'

/**
 * Rating aggregate, maintained by the Reviews collection hooks.
 *
 * Nullable on purpose: "no rating" and "rated zero" must never render the same
 * way. A product with no reviews shows no rating UI at all.
 */
export const ratingFields: Field[] = [
  {
    name: 'ratingAverage',
    type: 'number',
    admin: {
      position: 'sidebar',
      readOnly: true,
      description: 'Derived from approved reviews. Blank when there are none.',
    },
  },
  {
    name: 'ratingCount',
    type: 'number',
    admin: { position: 'sidebar', readOnly: true },
  },
]

/**
 * Sourcing mode + Google Merchant Center attributes.
 *
 * The critical rule this encodes: Google forbids promoting affiliate links in
 * Shopping. A product whose checkout happens on someone else's domain must
 * never reach the feed, or we risk the `mismatched checkout URL domains`
 * disapproval and, worse, account-level misrepresentation enforcement that
 * would take our direct products down too.
 *
 * `feedEligible` is therefore DERIVED, never hand-set — see the beforeChange
 * hook below. It is the single guard between the catalogue and the feed.
 *
 * See docs/decisions/2026-07-27-affiliate-products-merchant-center.md
 */
export const sourcingTab: Tab = {
  label: 'Sourcing & Feed',
  description: 'How this product is fulfilled, and whether it reaches Google Merchant Center.',
  fields: [
    {
      name: 'fulfilment',
      type: 'select',
      defaultValue: 'direct',
      options: [
        { label: 'Direct — our stock, our checkout', value: 'direct' },
        { label: 'Dropship — supplier ships, our checkout', value: 'dropship' },
        { label: 'Affiliate — external checkout (NOT advertisable)', value: 'affiliate' },
      ],
      admin: {
        description:
          'Direct and dropship are both sold by us, so both can be advertised. Affiliate sends the customer off-site and is permanently excluded from the Google feed.',
      },
      required: true,
    },
    {
      name: 'feedEligible',
      type: 'checkbox',
      admin: {
        description:
          'Derived from fulfilment — cannot be set by hand. Affiliate products are never eligible.',
        position: 'sidebar',
        readOnly: true,
      },
      defaultValue: true,
      hooks: {
        beforeChange: [
          ({ siblingData }) => siblingData?.fulfilment !== 'affiliate',
        ],
      },
    },

    // --- Dropship ------------------------------------------------
    {
      name: 'supplier',
      type: 'relationship',
      relationTo: 'suppliers',
      admin: {
        condition: (_, siblingData) => siblingData?.fulfilment === 'dropship',
      },
      required: false,
    },
    {
      name: 'supplierSku',
      type: 'text',
      admin: {
        condition: (_, siblingData) => siblingData?.fulfilment === 'dropship',
        description: 'The supplier’s own identifier, used when routing the purchase order.',
      },
    },
    {
      name: 'supplierCost',
      type: 'number',
      admin: {
        condition: (_, siblingData) => siblingData?.fulfilment === 'dropship',
        description:
          'What we pay the supplier, in MINOR units (cents). Never a float. Used for margin reporting, never exposed publicly.',
        step: 1,
      },
      min: 0,
    },
    {
      name: 'leadTimeDaysOverride',
      type: 'number',
      admin: {
        condition: (_, siblingData) => siblingData?.fulfilment === 'dropship',
        description: 'Overrides the supplier default for this product only. Leave blank to inherit.',
      },
      min: 0,
    },

    // --- Affiliate -----------------------------------------------
    {
      name: 'affiliateUrl',
      type: 'text',
      admin: {
        condition: (_, siblingData) => siblingData?.fulfilment === 'affiliate',
        description:
          'Outbound checkout URL. Rendered with rel="sponsored" and a visible disclosure — required by EU consumer law independently of Google.',
      },
    },
    {
      name: 'affiliateNetwork',
      type: 'text',
      admin: {
        condition: (_, siblingData) => siblingData?.fulfilment === 'affiliate',
      },
    },
    {
      name: 'affiliateLastVerifiedAt',
      type: 'date',
      admin: {
        condition: (_, siblingData) => siblingData?.fulfilment === 'affiliate',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Affiliate prices drift. Stale prices mislead customers and hurt trust.',
      },
    },

    // --- Google Merchant Center attributes ------------------------
    {
      type: 'collapsible',
      label: 'Google Merchant Center attributes',
      admin: {
        condition: (_, siblingData) => siblingData?.fulfilment !== 'affiliate',
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'brand',
              type: 'text',
              admin: {
                width: '50%',
                description: 'Required unless the product genuinely has no brand.',
              },
            },
            {
              name: 'condition',
              type: 'select',
              defaultValue: 'new',
              options: [
                { label: 'New', value: 'new' },
                { label: 'Refurbished', value: 'refurbished' },
                { label: 'Used', value: 'used' },
              ],
              admin: { width: '50%' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'gtin',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'EAN/UPC/ISBN. Strongly improves Shopping performance — Google matches offers across merchants on GTIN.',
              },
            },
            {
              name: 'mpn',
              type: 'text',
              admin: {
                width: '50%',
                description: 'Manufacturer part number. Use when no GTIN exists.',
              },
            },
          ],
        },
        {
          name: 'googleProductCategory',
          type: 'text',
          admin: {
            description:
              'Google’s taxonomy ID, e.g. 2271. Required for some verticals and improves matching everywhere.',
          },
        },
        // --- Variant family (sibling-page model) --------------------
        // Colour/size siblings are SEPARATE products sharing an itemGroupId —
        // the model Google mandates for the feed (one offer per variant, each
        // with its own link/image/GTIN, grouped by item_group_id) and the one
        // this shop uses on the storefront: the product page's option selector
        // NAVIGATES to the sibling page rather than switching in place.
        {
          type: 'row',
          fields: [
            {
              name: 'itemGroupId',
              type: 'text',
              index: true,
              validate: (value: unknown) => {
                if (!value) return true
                const v = String(value)
                if (v.length > 50) return 'Google caps item_group_id at 50 characters.'
                if (!/^[A-Za-z0-9_-]+$/.test(v))
                  return 'Letters, digits, underscore and dash only (Google treats it case-insensitively).'
                return true
              },
              admin: {
                width: '50%',
                description:
                  'Shared by every variant of the same product family. Products with the same value link to each other as colour/size options. Leave empty for standalone products.',
              },
            },
            {
              name: 'variantLabel',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'What makes THIS sibling different, e.g. “Cream / 32 Quarts”. Shown on the family selector.',
              },
            },
          ],
        },
        {
          type: 'row',
          admin: {
            condition: (_, siblingData) => Boolean(siblingData?.itemGroupId),
          },
          fields: [
            {
              name: 'color',
              type: 'text',
              admin: {
                width: '50%',
                description: 'Feed attribute. This sibling’s colour, e.g. “Empire Red”.',
              },
            },
            {
              name: 'size',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'Feed attribute. Size or capacity, e.g. “7 quarts” — Google has no capacity attribute, size carries it.',
              },
            },
          ],
        },
        {
          name: 'excludeFromFeed',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Manually hold an otherwise-eligible product back from the feed (e.g. pending imagery or a policy review).',
          },
        },
        {
          name: 'feedExclusionReason',
          type: 'text',
          admin: {
            condition: (_, siblingData) => siblingData?.excludeFromFeed === true,
          },
        },
      ],
    },
  ],
}
