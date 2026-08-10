import React from 'react'

import { getAnalyticsSettings, validGaId, validGtmId } from '@/lib/analytics/settings'

/**
 * Google Consent Mode v2 default — declared in <head>, before ANY
 * tag-loading script (GTM's container script and GA4's gtag.js library
 * both read the dataLayer state at load time, and GTM in particular starts
 * evaluating tags almost immediately). This must render earlier than both,
 * which is why it is a plain inline <script> in the root layout's <head>
 * rather than a next/script afterInteractive tag in <body> — order between
 * separate scripts is only guaranteed by document position, not strategy.
 *
 * Default is GRANTED (opt-out model, owner decision 2026-08-10): tracking
 * starts on load; a stored 'denied' choice (visitor clicked Decline on a
 * previous visit) downgrades it before anything else runs.
 */
export const ConsentDefault: React.FC = async () => {
  const settings = await getAnalyticsSettings()
  const hasTracking = Boolean(validGaId(settings?.gaMeasurementId) || validGtmId(settings?.gtmContainerId))
  const consentManaged = settings?.cookieBannerEnabled !== false

  if (!hasTracking || !consentManaged) return null

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted',
  wait_for_update: 500
});
var storedConsent = document.cookie.match(/(?:^|; )cookie_consent=(granted|denied)/);
if (storedConsent && storedConsent[1] === 'denied') {
  gtag('consent', 'update', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied'
  });
}`,
      }}
    />
  )
}
