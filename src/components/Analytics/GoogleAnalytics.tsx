import configPromise from '@payload-config'
import { getPayload } from 'payload'
import Script from 'next/script'
import React from 'react'
import { cache } from 'react'

import { CookieBanner } from './CookieBanner'

/**
 * GA4 loader — renders nothing at all unless a measurement ID is configured
 * in Settings → Analytics, so a fresh shop ships zero tracking bytes.
 *
 * Plain gtag.js via next/script (no extra dependency): GA4's enhanced
 * measurement detects History-API navigations, so SPA route changes produce
 * page_views without custom code. E-commerce events come from
 * src/lib/analytics/gtag.ts at the funnel points.
 *
 * With the cookie banner enabled this also wires Google Consent Mode v2:
 * the consent DEFAULT (all four v2 signals denied) is declared in the same
 * inline script BEFORE gtag('config') — order inside one script is the only
 * ordering guarantee — then a returning visitor's stored choice is replayed
 * as a consent update. Until consent, Google receives cookieless pings and
 * models the gap; after Accept, full measurement. The banner itself only
 * renders while no choice is stored.
 *
 * Rendered in the root layout, which is STATIC — the script (and the ID in
 * it) is baked into cached pages, which is why the Analytics global's
 * afterChange hook purges the whole cache.
 */

const getAnalytics = cache(async () => {
  try {
    const payload = await getPayload({ config: configPromise })
    return await payload.findGlobal({ slug: 'analytics', depth: 0 })
  } catch {
    return null
  }
})

export const GoogleAnalytics: React.FC = async () => {
  const settings = await getAnalytics()
  const id = settings?.gaMeasurementId?.trim()

  if (!id || !/^G-[A-Z0-9]{4,}$/i.test(id)) return null

  const consentManaged = settings?.cookieBannerEnabled !== false

  const consentPreamble = consentManaged
    ? `gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
var storedConsent = document.cookie.match(/(?:^|; )cookie_consent=(granted|denied)/);
if (storedConsent && storedConsent[1] === 'granted') {
  gtag('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted'
  });
}
`
    : ''

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
${consentPreamble}gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
      {consentManaged && <CookieBanner />}
    </>
  )
}
