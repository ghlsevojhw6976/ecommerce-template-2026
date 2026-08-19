'use client'

/**
 * GA4 event senders — the browser half. Item building and money conversion
 * live in ./items (server-safe); this module only pushes to gtag.
 *
 * Every function is a silent no-op when GA isn't configured (no gtag on
 * window) — analytics must never break shopping.
 */

import { itemsValue, type GaItem, type GaPurchase } from './items'

export type { GaItem, GaPurchase } from './items'
export { centsToGa, gaItem } from './items'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
    /** Google Ads purchase conversion send_to (AW-…/label), set by the gtag loader when configured in Settings → Analytics. */
    __adsPurchaseSendTo?: string
  }
}

const send = (eventName: string, params: Record<string, unknown>): void => {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  try {
    window.gtag('event', eventName, params)
  } catch {
    // Analytics must never break shopping.
  }
}

const withValue = (items: GaItem[]): Record<string, unknown> => ({
  currency: 'USD',
  value: itemsValue(items),
  items,
})

export const trackViewItem = (item: GaItem): void => send('view_item', withValue([item]))

export const trackAddToCart = (item: GaItem): void => send('add_to_cart', withValue([item]))

export const trackRemoveFromCart = (item: GaItem): void =>
  send('remove_from_cart', withValue([item]))

export const trackViewCart = (items: GaItem[]): void => {
  if (items.length) send('view_cart', withValue(items))
}

export const trackBeginCheckout = (items: GaItem[]): void => {
  if (items.length) send('begin_checkout', withValue(items))
}

/**
 * Fire the purchase exactly once per order. The confirmation page can be
 * refreshed, revisited from an email, or reached twice by an impatient
 * back-button — GA4 deduplicates same-session transaction_ids only, so the
 * cross-session guard lives here in localStorage.
 *
 * The same guard also covers the Google Ads purchase conversion (when
 * Settings → Analytics has the conversion ID + label): Ads deduplicates on
 * transaction_id too, but only against conversions it has already recorded —
 * the localStorage guard keeps refreshes from even attempting a resend.
 */
export const trackPurchaseOnce = (purchase: GaPurchase): void => {
  if (typeof window === 'undefined') return
  const key = `ga_purchase_${purchase.transaction_id}`
  try {
    if (window.localStorage.getItem(key)) return
    window.localStorage.setItem(key, '1')
  } catch {
    // Storage unavailable (private mode) — fire anyway; GA's own
    // same-session dedupe still applies.
  }
  send('purchase', { ...purchase })
  if (window.__adsPurchaseSendTo) {
    send('conversion', {
      send_to: window.__adsPurchaseSendTo,
      transaction_id: purchase.transaction_id,
      value: purchase.value,
      currency: purchase.currency,
    })
  }
}
