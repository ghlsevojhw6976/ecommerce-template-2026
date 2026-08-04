import type { Company } from '@/payload-types'

/**
 * The cross-border shipping disclaimer, built once and reused everywhere.
 *
 * Product page, shipping policy and terms all render the same sentence from the
 * same values, so they cannot contradict each other — which matters, because
 * this is a promise about when a parcel arrives and who pays the customs bill.
 *
 * A single switch in Company settings removes it from every surface at once.
 */

/**
 * One fact, ready to render beside an icon.
 *
 * The structured form exists so the product page can show three scannable rows
 * instead of a paragraph. A block of prose next to a buy button gets skipped;
 * "Ships from Germany · 9–16 days · duties paid" gets read.
 */
export type DisclaimerFact = {
  icon: 'origin' | 'transit' | 'customs'
  label: string
  detail: string
}

export type ShippingDisclaimer = {
  enabled: boolean
  /** Full sentence for policy pages, where prose is appropriate. */
  text: string
  /** Compact version for very tight spaces. */
  short: string
  /** Scannable rows for the product page. */
  facts: DisclaimerFact[]
  /** Total door-to-door window including processing. */
  totalMinDays: number
  totalMaxDays: number
  customsHandling: 'ddp' | 'ddu' | 'unspecified'
}

const DISABLED: ShippingDisclaimer = {
  enabled: false,
  text: '',
  short: '',
  facts: [],
  totalMinDays: 0,
  totalMaxDays: 0,
  customsHandling: 'unspecified',
}

const businessDays = (n: number): string => `${n} business day${n === 1 ? '' : 's'}`

export const getShippingDisclaimer = (company: Partial<Company>): ShippingDisclaimer => {
  if (!company.shippingDisclaimerEnabled) return DISABLED

  const from = company.shipsFrom?.trim() || 'our warehouse'
  const to = company.shipsTo?.trim()
  const processing = company.processingTimeDays ?? 2
  const minTransit = company.deliveryMinDays ?? 7
  const maxTransit = company.deliveryMaxDays ?? 14
  const customs = (company.customsHandling ?? 'unspecified') as ShippingDisclaimer['customsHandling']

  // Quote the door-to-door window, not just transit. A customer reads "7–14
  // days" as time until it arrives, not time after an invisible processing
  // step — and the gap between those two readings is where complaints start.
  const totalMinDays = processing + minTransit
  const totalMaxDays = processing + maxTransit

  const customsSentence =
    customs === 'ddp'
      ? ' All duties and import taxes are paid by us, so there is nothing to pay on delivery.'
      : customs === 'ddu'
        ? ' Import duties and taxes are not included and are payable by you on delivery. These are set by customs, not by us.'
        : ''

  const override = company.shippingDisclaimerOverride?.trim()

  const text =
    override ||
    `Orders ship from ${from}${to ? ` to ${to}` : ''}. We dispatch within ` +
      `${businessDays(processing)}, and delivery typically takes a further ` +
      `${minTransit}–${maxTransit} days — usually ${totalMinDays}–${totalMaxDays} days in total ` +
      `from the day you order.${customsSentence}`

  const short = override
    ? override
    : `Ships from ${from} · ${totalMinDays}–${totalMaxDays} days total` +
      (customs === 'ddp' ? ' · duties paid' : customs === 'ddu' ? ' · duties payable on delivery' : '')

  const facts: DisclaimerFact[] = [
    {
      icon: 'origin',
      label: `Ships from ${from}`,
      detail: to ? `Delivered to ${to}` : `Dispatched in ${businessDays(processing)}`,
    },
    {
      icon: 'transit',
      label: `${totalMinDays}–${totalMaxDays} days to arrive`,
      detail: `${businessDays(processing)} to dispatch, then ${minTransit}–${maxTransit} in transit`,
    },
    ...(customs === 'ddp'
      ? [
          {
            icon: 'customs' as const,
            label: 'Duties and taxes included',
            detail: 'Nothing to pay on delivery',
          },
        ]
      : customs === 'ddu'
        ? [
            {
              icon: 'customs' as const,
              label: 'Import duties payable on delivery',
              detail: 'Set by customs, not by us',
            },
          ]
        : []),
  ]

  return { enabled: true, text, short, facts, totalMinDays, totalMaxDays, customsHandling: customs }
}
