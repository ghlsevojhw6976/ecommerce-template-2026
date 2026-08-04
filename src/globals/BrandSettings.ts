import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { revalidateEverything } from '@/hooks/revalidateStorefront'

/**
 * Brand & Theme — the per-shop layer.
 *
 * This is the whole reusability story: the design language (type, rhythm,
 * density, motion) is shared by every shop built from this template, and this
 * global is the part that differs. Paste a palette, get a different shop.
 *
 * Tokens are computed at render time from what is stored here and injected as a
 * <style> block, so a palette change is instant — no rebuild, no redeploy.
 *
 * See docs/design/2026-07-28-ui-plan.md §3
 */
export const BrandSettings: GlobalConfig = {
  slug: 'brand-settings',
  hooks: {
    afterChange: [revalidateEverything],
  },
  label: 'Brand & Theme',
  access: {
    // Public read: the storefront needs the palette on every request.
    read: () => true,
    update: adminOnly,
  },
  admin: {
    group: 'Settings',
  },
  fields: [
    {
      name: 'palette',
      type: 'text',
      admin: {
        description:
          'Paste a coolors.co palette URL (e.g. coolors.co/palette/264653-2a9d8f-e9c46a-f4a261-e76f51) or a list of hex codes. 3–5 colours. Leave blank to use the default theme.',
      },
    },
    {
      name: 'preview',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/BrandAdmin/PalettePreview#PalettePreview',
        },
      },
    },
    {
      name: 'enableDarkMode',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Generate a dark variant. Not an inversion — chroma is reduced independently.',
      },
    },

    // ---- Structural variety ---------------------------------------------
    // The knobs that let two shops sharing a palette read as genuinely
    // different products, rather than the same template in another colour.
    {
      type: 'collapsible',
      label: 'Structure',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'radius',
              type: 'select',
              defaultValue: '0.25rem',
              options: [
                { label: 'Sharp (0)', value: '0rem' },
                { label: 'Slight (4px)', value: '0.25rem' },
                { label: 'Rounded (12px)', value: '0.75rem' },
                { label: 'Soft (24px)', value: '1.5rem' },
              ],
              admin: {
                width: '50%',
                description:
                  'Heavy rounding reads consumer-app rather than considered-purchase.',
              },
            },
            {
              name: 'density',
              type: 'select',
              defaultValue: 'comfortable',
              options: [
                { label: 'Compact', value: 'compact' },
                { label: 'Comfortable', value: 'comfortable' },
                { label: 'Spacious', value: 'spacious' },
              ],
              admin: {
                width: '50%',
                description: 'Whitespace is the oldest signal of confidence.',
              },
            },
          ],
        },
      ],
    },
  ],
}
