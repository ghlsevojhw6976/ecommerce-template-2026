import type { Block } from 'payload'

/**
 * Company contact details, as a page block.
 *
 * A block rather than something hardcoded into the contact page, because the
 * same details belong on an About page, a wholesale page, or anywhere else a
 * shop wants them. All the values come from Company settings — the block only
 * decides where they appear.
 */
export const ContactDetailsBlock: Block = {
  slug: 'contactDetails',
  interfaceName: 'ContactDetailsBlock',
  labels: {
    singular: 'Contact details',
    plural: 'Contact details',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      admin: { description: 'Optional. Defaults to “Other ways to reach us”.' },
    },
    {
      name: 'intro',
      type: 'textarea',
      admin: { description: 'Optional line above the details.' },
    },
    {
      name: 'showReturnsAddress',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Include the returns address. Useful on a contact page — people look for it here as often as on the returns policy.',
      },
    },
  ],
}
