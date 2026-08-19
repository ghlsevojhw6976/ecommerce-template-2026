import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

/**
 * Single cached fetch of the Analytics global, shared by every server
 * component that needs it (consent default, GTM head/body, GA4 loader,
 * cookie banner) — React's cache() dedupes these into one query per request
 * as long as everyone imports THIS function rather than rolling their own.
 */
export const getAnalyticsSettings = cache(async () => {
  try {
    const payload = await getPayload({ config: configPromise })
    return await payload.findGlobal({ slug: 'analytics', depth: 0 })
  } catch {
    return null
  }
})

export const GA_ID_PATTERN = /^G-[A-Z0-9]{4,}$/i
export const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/i
export const AW_ID_PATTERN = /^AW-\d{6,}$/i
// The conversion label is the opaque token after the slash in Google's
// event-snippet send_to (e.g. AW-123456789/AbC-dEfGhIjK).
export const ADS_LABEL_PATTERN = /^[A-Za-z0-9_-]{6,}$/

export const validGaId = (id: unknown): string | undefined => {
  const trimmed = typeof id === 'string' ? id.trim() : ''
  return trimmed && GA_ID_PATTERN.test(trimmed) ? trimmed : undefined
}

export const validGtmId = (id: unknown): string | undefined => {
  const trimmed = typeof id === 'string' ? id.trim() : ''
  return trimmed && GTM_ID_PATTERN.test(trimmed) ? trimmed : undefined
}

export const validAwId = (id: unknown): string | undefined => {
  const trimmed = typeof id === 'string' ? id.trim() : ''
  return trimmed && AW_ID_PATTERN.test(trimmed) ? trimmed : undefined
}

/**
 * `send_to` for the Google Ads purchase conversion (AW-…/label), or undefined
 * unless BOTH the conversion ID and the purchase label are set and valid —
 * a bare AW config still measures, but conversion events need the pair.
 */
export const adsPurchaseSendTo = (
  settings: { googleAdsId?: string | null; googleAdsPurchaseLabel?: string | null } | null,
): string | undefined => {
  const id = validAwId(settings?.googleAdsId)
  const label = typeof settings?.googleAdsPurchaseLabel === 'string' ? settings.googleAdsPurchaseLabel.trim() : ''
  return id && ADS_LABEL_PATTERN.test(label) ? `${id}/${label}` : undefined
}
