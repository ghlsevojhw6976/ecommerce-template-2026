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
      'Google Analytics 4, Google Tag Manager and/or Google Ads conversion tracking. Paste an ID to enable tracking sitewide — leave all empty to run without analytics.',
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
      name: 'gtmContainerId',
      label: 'GTM container ID',
      type: 'text',
      admin: {
        description:
          'Looks like GTM-XXXXXXX — Tag Manager → Admin → Container ID. Optional and independent of the GA4 field above; runs alongside it if both are set. Loads the container script in <head> and the noscript fallback at the top of <body>, exactly per Google\'s own install instructions. Empty disables it entirely.',
      },
      validate: (value: unknown) => {
        if (!value) return true
        if (typeof value === 'string' && /^GTM-[A-Z0-9]+$/i.test(value.trim())) return true
        return 'A GTM container ID looks like GTM-XXXXXXX (not G-… — that is a GA4 measurement ID, the field above).'
      },
    },
    {
      name: 'googleAdsId',
      label: 'Google Ads conversion ID',
      type: 'text',
      admin: {
        description:
          'Looks like AW-XXXXXXXXXX — from the Google Ads conversion "Install the tag" instructions (the id in gtag(\'config\', …)). Loads the same gtag.js the GA4 field uses; works with or without a GA4 ID. Empty = no Ads tag.',
      },
      validate: (value: unknown) => {
        if (!value) return true
        if (typeof value === 'string' && /^AW-\d{6,}$/i.test(value.trim())) return true
        return 'A Google Ads conversion ID looks like AW-XXXXXXXXXX (not G-… — that is the GA4 field above).'
      },
    },
    {
      name: 'googleAdsPurchaseLabel',
      label: 'Google Ads purchase conversion label',
      type: 'text',
      admin: {
        description:
          "The token AFTER the slash in the event snippet's send_to (send_to: 'AW-XXXX/THIS-PART'). With the conversion ID above, fires the purchase conversion on the order confirmation page — real transaction_id (order id, deduplicated), charged value and currency. Requires the conversion ID to be set.",
      },
      validate: (value: unknown) => {
        if (!value) return true
        if (typeof value === 'string' && /^[A-Za-z0-9_-]{6,}$/.test(value.trim())) return true
        return "The conversion label is the part after the slash in send_to — letters, digits, - and _ only (don't include the AW-… prefix or the slash)."
      },
    },
    {
      name: 'cookieBannerEnabled',
      label: 'Cookie consent banner',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Shows a small consent bar and wires Google Consent Mode v2 for both GA4 and GTM: analytics/ad storage default to GRANTED on load (tracking starts immediately), and a visitor who clicks Decline is pulled down to denied for that visit onward. The banner never renders unless a GA4 or GTM ID is set.',
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
