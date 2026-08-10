import React from 'react'

import { getAnalyticsSettings, validGaId, validGtmId } from '@/lib/analytics/settings'

import { CookieBanner } from './CookieBanner'

/**
 * Gates the visible consent bar on "is anything actually tracking" (GA4 or
 * GTM) AND the admin toggle — split out from GoogleAnalytics so a shop
 * running GTM-only (no direct GA4 measurement ID) still gets the banner.
 */
export const ConsentBanner: React.FC = async () => {
  const settings = await getAnalyticsSettings()
  const hasTracking = Boolean(validGaId(settings?.gaMeasurementId) || validGtmId(settings?.gtmContainerId))
  const consentManaged = settings?.cookieBannerEnabled !== false

  if (!hasTracking || !consentManaged) return null

  return <CookieBanner />
}
