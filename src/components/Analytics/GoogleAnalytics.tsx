import Script from 'next/script'
import React from 'react'

import {
  adsPurchaseSendTo,
  getAnalyticsSettings,
  validAwId,
  validGaId,
} from '@/lib/analytics/settings'

/**
 * gtag.js loader for GA4 and/or Google Ads — renders nothing at all unless a
 * measurement ID or an Ads conversion ID is configured in Settings →
 * Analytics, so a fresh shop ships zero tracking bytes.
 *
 * One gtag.js script serves both products: each configured ID gets its own
 * gtag('config') call, exactly per Google's own install instructions (the
 * Ads snippet's separate <script src> is the same library — loading it once
 * is what Google's instructions themselves say to do).
 *
 * The Ads purchase conversion needs a `send_to` (AW-…/label) at event time,
 * client-side, inside trackPurchaseOnce's once-per-order guard — so when the
 * pair is configured it is exposed as window.__adsPurchaseSendTo here, baked
 * into the same static layout as the config calls.
 *
 * Consent Mode v2 defaults are declared earlier, in <head>, by
 * ConsentDefault — before this script and before GTM's, so both correctly
 * inherit the default the moment they load. This component only loads the
 * gtag.js library and fires 'js'/'config'.
 *
 * Rendered in the root layout, which is STATIC — the script (and the IDs in
 * it) is baked into cached pages, which is why the Analytics global's
 * afterChange hook purges the whole cache.
 */
export const GoogleAnalytics: React.FC = async () => {
  const settings = await getAnalyticsSettings()
  const gaId = validGaId(settings?.gaMeasurementId)
  const awId = validAwId(settings?.googleAdsId)
  const purchaseSendTo = adsPurchaseSendTo(settings)

  if (!gaId && !awId) return null

  const configs = [gaId, awId]
    .filter((id): id is string => Boolean(id))
    .map((id) => `gtag('config', '${id}');`)
    .join('\n')

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId ?? awId!)}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
${configs}${purchaseSendTo ? `\nwindow.__adsPurchaseSendTo = '${purchaseSendTo}';` : ''}`}
      </Script>
    </>
  )
}
