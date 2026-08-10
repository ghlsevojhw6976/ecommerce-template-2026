import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { revalidateEverything } from '@/hooks/revalidateStorefront'

/**
 * Settings → Analytics.
 *
 * Per-shop analytics wiring lives in the admin, like Stripe keys and the
 * Merchant Center connection — a new shop is configured by filling in forms,
 * never by editing env files. The GA4 measurement ID is public by definition
 * (it ships in the page source of every site using GA), so it is stored in
 * clear and readable publicly; only admins may change it.
 *
 * The gtag script is baked into the STATIC pages by the root layout, so
 * changing the ID here purges the whole cache (revalidateEverything) —
 * without that, a pasted ID would only take effect page-by-page as the
 * hourly fallback rolled through.
 */
export const AnalyticsSettings: GlobalConfig = {
  slug: 'analytics',
  label: 'Analytics',
  access: {
    read: () => true,
    update: adminOnly,
  },
  admin: {
    group: 'Settings',
    description:
      'Google Analytics 4. Paste a measurement ID to enable tracking sitewide — leave empty to run without analytics.',
  },
  hooks: {
    afterChange: [revalidateEverything],
  },
  fields: [
    {
      name: 'gaMeasurementId',
      label: 'GA4 measurement ID',
      type: 'text',
      admin: {
        description:
          'Looks like G-XXXXXXXXXX — Google Analytics → Admin → Data streams → your web stream. Empty disables tracking entirely (no script is loaded).',
      },
      validate: (value: unknown) => {
        if (!value) return true
        if (typeof value === 'string' && /^G-[A-Z0-9]{4,}$/i.test(value.trim())) return true
        return 'A GA4 measurement ID looks like G-XXXXXXXXXX (not UA-… — Universal Analytics shut down in 2023, and not GTM-… — that is a Tag Manager container).'
      },
    },
    {
      name: 'cookieBannerEnabled',
      label: 'Cookie consent banner',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Shows a small consent bar and wires Google Consent Mode v2: analytics/ad storage default to GRANTED on load (tracking starts immediately), and a visitor who clicks Decline is pulled down to denied for that visit onward. The banner never renders while the measurement ID is empty either way.',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      admin: {
        description:
          'Optional. E-commerce events sent automatically: view_item, add_to_cart, remove_from_cart, view_cart, begin_checkout, purchase — visible in GA under Reports → Monetization once traffic flows.',
      },
    },
  ],
}
