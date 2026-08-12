import type { Tab } from 'payload'

/**
 * The content a €400–1200 purchase needs.
 *
 * At this price the buyer does two things: falls for the object, then validates
 * the decision. The gallery and title serve the first; everything here serves
 * the second. Research on high-ticket conversion is consistent that the blocker
 * is *risk*, not price — is it authentic, is it as described, can I return it,
 * will someone help me.
 *
 * Every field is optional by design. The template runs many shops across
 * kitchenware, electronics and outdoor: a product with four specs and one with
 * twenty-four must both render deliberately, and a shop that has not filled
 * these in yet must not render empty scaffolding.
 *
 * Field definitions and priorities: PRODUCT-DATA-REQUIREMENTS.md
 */
export const detailsTab: Tab = {
  label: 'Details & Specs',
  description:
    'Everything below the fold on the product page. All optional — sections hide themselves when empty.',
  fields: [
    {
      name: 'shortDescription',
      type: 'textarea',
      maxLength: 300,
      admin: {
        description:
          'One or two sentences shown directly under the title, next to the buy button. Lead with the benefit, not the feature.',
      },
    },
    {
      name: 'keyFeatures',
      type: 'array',
      labels: { singular: 'Feature', plural: 'Key features' },
      maxRows: 8,
      admin: {
        description:
          'The scannable layer people actually read before the full description. 3–6 works best.',
      },
      fields: [
        { name: 'feature', type: 'text', required: true },
        {
          name: 'detail',
          type: 'text',
          admin: { description: 'Optional supporting clause.' },
        },
      ],
    },
    {
      name: 'specifications',
      type: 'array',
      labels: { singular: 'Specification', plural: 'Specifications' },
      admin: {
        description:
          'Rendered as a table in tabular figures. This is what electronics buyers compare on, and what stops a pre-sales email.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', required: true, admin: { width: '40%' } },
            { name: 'value', type: 'text', required: true, admin: { width: '40%' } },
            {
              name: 'group',
              type: 'text',
              admin: {
                width: '20%',
                description: 'Optional heading, e.g. "Dimensions".',
              },
            },
          ],
        },
      ],
    },
    {
      name: 'inTheBox',
      type: 'array',
      labels: { singular: 'Item', plural: "What's in the box" },
      admin: {
        description:
          'Prevents "where is the cable" support tickets, and the returns that follow them.',
      },
      fields: [{ name: 'item', type: 'text', required: true }],
    },
    {
      name: 'careInstructions',
      type: 'textarea',
      admin: {
        description: 'Kitchenware and outdoor especially — care detail signals quality.',
      },
    },

    // ---- Reassurance -----------------------------------------------------
    {
      type: 'collapsible',
      label: 'Reassurance',
      admin: { initCollapsed: false },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'warrantyMonths',
              type: 'number',
              min: 0,
              admin: {
                width: '50%',
                description:
                  '⚠️ Currently unused — no page reads this field. All warranty/guarantee copy was consolidated to the single 40tag Guarantee (src/lib/commerce/guarantee.ts) on 2026-08-12, since 40tag is not an authorized retailer for the brands it sells and cannot promise per-product manufacturer warranty terms. Left in the schema rather than deleted (a destructive change); safe to remove properly if it stays unused.',
              },
            },
            {
              name: 'returnWindowDays',
              type: 'number',
              min: 0,
              defaultValue: 30,
              admin: {
                width: '50%',
                description:
                  '30 days is the US baseline expectation. 15% of shoppers abandon over an unsatisfactory return policy, and 60% look for it on the product page.',
              },
            },
          ],
        },
        {
          name: 'freeShippingEligible',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description:
              'Unexpected shipping cost is the single biggest cause of checkout abandonment (39%). Say so before the cart, not in it.',
          },
        },
      ],
    },

    // ---- Physical --------------------------------------------------------
    {
      type: 'collapsible',
      label: 'Physical & shipping',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'weightGrams',
              type: 'number',
              min: 0,
              admin: { width: '50%', description: 'Grams. Required for real shipping rates.' },
            },
            {
              name: 'shippingClass',
              type: 'select',
              defaultValue: 'standard',
              options: [
                { label: 'Standard', value: 'standard' },
                { label: 'Oversized', value: 'oversized' },
                { label: 'Fragile', value: 'fragile' },
                { label: 'Hazardous', value: 'hazardous' },
              ],
              admin: { width: '50%' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'lengthMm', type: 'number', min: 0, admin: { width: '33%' } },
            { name: 'widthMm', type: 'number', min: 0, admin: { width: '33%' } },
            { name: 'heightMm', type: 'number', min: 0, admin: { width: '34%' } },
          ],
        },
      ],
    },

    // ---- Unit pricing ----------------------------------------------------
    {
      type: 'collapsible',
      label: 'Unit pricing',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'unitPricingMeasure',
              type: 'text',
              admin: {
                width: '50%',
                description: 'What you get, e.g. "500ml", "2kg", "12 pack".',
              },
            },
            {
              name: 'unitPricingBaseMeasure',
              type: 'text',
              admin: {
                width: '50%',
                description: 'What to price against, e.g. "100ml". Yields "$0.74 per 100ml".',
              },
            },
          ],
        },
      ],
    },
  ],
}
