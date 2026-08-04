'use client'

/**
 * Google Consent Mode v2 — the client half.
 *
 * The consent DEFAULT (denied) is set by an inline script in the layout
 * BEFORE gtag config runs; this module handles the visitor's decision:
 * persist it in a first-party cookie and tell Google via
 * gtag('consent','update', …) — the signal GA4/Ads natively understand.
 *
 * The cookie lives 180 days (the common re-ask window), path=/ so every page
 * sees it, SameSite=Lax. Value is exactly 'granted' or 'denied'.
 */

export const CONSENT_COOKIE = 'cookie_consent'
const MAX_AGE_DAYS = 180

export type ConsentState = 'granted' | 'denied'

/** The four Consent Mode v2 signals, moved together. */
const consentSignals = (state: ConsentState) => ({
  ad_storage: state,
  ad_user_data: state,
  ad_personalization: state,
  analytics_storage: state,
})

export const readConsent = (): ConsentState | null => {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=(granted|denied)`))
  return (match?.[1] as ConsentState) ?? null
}

export const applyConsent = (state: ConsentState): void => {
  if (typeof document === 'undefined') return

  document.cookie = `${CONSENT_COOKIE}=${state}; Max-Age=${MAX_AGE_DAYS * 86400}; Path=/; SameSite=Lax`

  if (typeof window.gtag === 'function') {
    try {
      window.gtag('consent', 'update', consentSignals(state))
    } catch {
      // Consent must never break the page.
    }
  }
}
