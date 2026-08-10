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

export const validGaId = (id: unknown): string | undefined => {
  const trimmed = typeof id === 'string' ? id.trim() : ''
  return trimmed && GA_ID_PATTERN.test(trimmed) ? trimmed : undefined
}

export const validGtmId = (id: unknown): string | undefined => {
  const trimmed = typeof id === 'string' ? id.trim() : ''
  return trimmed && GTM_ID_PATTERN.test(trimmed) ? trimmed : undefined
}
