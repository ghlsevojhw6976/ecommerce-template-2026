import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { revalidateEverything } from '@/hooks/revalidateStorefront'

/**
 * Homepage content.
 *
 * Every piece of copy on the homepage lives here rather than in the components,
 * because this template runs many shops and a hardcoded line like "Chosen for
 * how they are made" would appear on all of them.
 *
 * Everything is optional and everything has a sensible fallback, so a shop that
 * has filled in nothing still renders a coherent homepage — it just uses the
 * company tagline and generic labels. Nothing is ever blank or broken.
 */
export const Homepage: GlobalConfig = {
  slug: 'homepage',
  hooks: {
    afterChange: [revalidateEverything],
  },
  label: 'Homepage',
  access: {
    read: () => true,
    update: adminOnly,
  },
  admin: {
    group: 'Settings',
    description: 'Hero copy and what the homepage features.',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        // ---------------------------------------------------------------
        {
          label: 'Hero',
          fields: [
            {
              name: 'eyebrow',
              type: 'text',
              admin: {
                description:
                  'Small line above the headline. Defaults to the company name. Keep it under ~30 characters.',
              },
            },
            {
              name: 'headline',
              type: 'textarea',
              admin: {
                description:
                  'The one thing a first-time visitor should take away. Defaults to the company tagline. Six to ten words works best — it is set large, and a long headline stops being a headline.',
              },
            },
            {
              name: 'subcopy',
              type: 'textarea',
              maxLength: 240,
              admin: {
                description:
                  'One or two sentences supporting the headline. Say what makes the range worth buying, not what the category is.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'primaryCtaLabel',
                  type: 'text',
                  admin: { width: '50%', description: 'Defaults to “Shop all”.' },
                },
                {
                  name: 'primaryCtaHref',
                  type: 'text',
                  admin: { width: '50%', description: 'Defaults to /shop.' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'secondaryCtaLabel',
                  type: 'text',
                  admin: { width: '50%', description: 'Optional. Hidden when blank.' },
                },
                {
                  name: 'secondaryCtaHref',
                  type: 'text',
                  admin: { width: '50%' },
                },
              ],
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Featured',
          description:
            'What the homepage puts in front of visitors. With a catalogue of any size this is the highest-value curation decision available — it is the only merchandising most visitors ever see.',
          fields: [
            {
              name: 'heroProduct',
              type: 'relationship',
              relationTo: 'products',
              admin: {
                description:
                  'Shown large in the hero. Pick something with strong photography — it is the first product anyone sees. Falls back to the newest product.',
              },
            },
            {
              name: 'featuredProducts',
              type: 'relationship',
              relationTo: 'products',
              hasMany: true,
              maxRows: 8,
              admin: {
                description:
                  'The “Featured” row. Leave empty to fall back to the newest products.',
              },
            },
            {
              name: 'featuredHeading',
              type: 'text',
              admin: { description: 'Defaults to “Featured”.' },
            },
            {
              name: 'featuredCategories',
              type: 'relationship',
              relationTo: 'categories',
              hasMany: true,
              maxRows: 6,
              admin: {
                description:
                  'Order and selection for the category grid. Leave empty to use the top-level categories in menu order.',
              },
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Sections',
          fields: [
            {
              name: 'showCategories',
              type: 'checkbox',
              defaultValue: true,
            },
            {
              name: 'showFeatured',
              type: 'checkbox',
              defaultValue: true,
            },
            {
              name: 'showTrustRow',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                description:
                  'Returns, shipping and the 40tag Guarantee. Worth keeping on — at higher price points the blocker is risk rather than price.',
              },
            },
          ],
        },
      ],
    },
  ],
}
