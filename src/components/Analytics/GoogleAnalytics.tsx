import Script from 'next/script'
import React from 'react'

import { getAnalyticsSettings, validGaId } from '@/lib/analytics/settings'

/**
 * GA4 loader — renders nothing at all unless a measurement ID is configured
 * in Settings → Analytics, so a fresh shop ships zero tracking bytes.
 *
 * Plain gtag.js via next/script (no extra dependency): GA4's enhanced
 * measurement detects History-API navigations, so SPA route changes produce
 * page_views without custom code. E-commerce events come from
 * src/lib/analytics/gtag.ts at the funnel points.
 *
 * Consent Mode v2 defaults are declared earlier, in <head>, by
 * ConsentDefault — before this script and before GTM's, so both correctly
 * inherit the default the moment they load. This component only loads the
 * gtag.js library and fires 'js'/'config'.
 *
 * Rendered in the root layout, which is STATIC — the script (and the ID in
 * it) is baked into cached pages, which is why the Analytics global's
 * afterChange hook purges the whole cache.
 */
export const GoogleAnalytics: React.FC = async () => {
  const settings = await getAnalyticsSettings()
  const id = validGaId(settings?.gaMeasurementId)

  if (!id) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
    </>
  )
}
