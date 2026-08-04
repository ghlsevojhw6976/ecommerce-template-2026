/**
 * Carrier tracking links. The select values live on the order's fulfilment
 * fields; the URL templates live here so the shipped email and any future
 * RMA/label surface agree on them.
 */

export const CARRIERS = [
  { label: 'USPS', value: 'usps' },
  { label: 'UPS', value: 'ups' },
  { label: 'FedEx', value: 'fedex' },
  { label: 'DHL', value: 'dhl' },
  { label: 'DPD', value: 'dpd' },
  { label: 'Deutsche Post', value: 'deutschepost' },
  { label: 'Other', value: 'other' },
] as const

export type CarrierValue = (typeof CARRIERS)[number]['value']

export const trackingUrlFor = (
  carrier: string | null | undefined,
  trackingNumber: string,
): string | null => {
  const number = encodeURIComponent(trackingNumber.trim())
  switch (carrier) {
    case 'usps':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`
    case 'ups':
      return `https://www.ups.com/track?tracknum=${number}`
    case 'fedex':
      return `https://www.fedex.com/fedextrack/?trknbr=${number}`
    case 'dhl':
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${number}`
    case 'dpd':
      // DELIStrack — the deep-link pattern e-commerce platforms standardise
      // on; works group-wide for DPD parcel numbers. (DPD's pages block bot
      // fetches, so this is verified against documented patterns, not a
      // crawl — customers clicking from their email are unaffected.)
      return `https://tracking.dpd.de/status/en_US/parcel/${number}`
    case 'deutschepost':
      // Deutsche Post's tracking page is client-rendered and blocks
      // non-browser fetches (same situation as DPD above) — the piececode
      // param is the standard deep-link format used across e-commerce
      // integration guides (JTL, Pickware/Shopware), and confirmed live
      // (200, not 404) with a browser user-agent.
      return `https://www.deutschepost.de/de/s/sendungsverfolgung/verfolgen.html?piececode=${number}`
    default:
      return null
  }
}
