import { describe, it, expect } from 'vitest'

import type { Company } from '@/payload-types'
import { buildPlaceholders, resolvePlaceholders } from '@/utilities/companyPlaceholders'
import { getShippingDisclaimer } from '@/utilities/shippingDisclaimer'

/**
 * The disclaimer is a promise about when a parcel arrives and who pays the
 * customs bill, repeated on the product page, the shipping policy, the FAQ and
 * the terms. Two things must hold: the numbers must agree everywhere, and the
 * off switch must genuinely remove it — including from CMS copy, where a
 * half-disabled feature would leave `{{company.shippingDisclaimer}}` printed on
 * the terms page.
 */

const BASE: Partial<Company> = {
  name: 'Fenwick & Cole',
  shippingDisclaimerEnabled: true,
  shipsFrom: 'Germany',
  shipsTo: 'the United States',
  processingTimeDays: 2,
  deliveryMinDays: 7,
  deliveryMaxDays: 14,
  customsHandling: 'ddp',
}

describe('the off switch', () => {
  it('produces nothing at all when disabled', () => {
    const result = getShippingDisclaimer({ ...BASE, shippingDisclaimerEnabled: false })
    expect(result.enabled).toBe(false)
    expect(result.text).toBe('')
    expect(result.short).toBe('')
  })

  it('is off by default, so an existing shop does not suddenly grow a disclaimer', () => {
    expect(getShippingDisclaimer({}).enabled).toBe(false)
  })

  it('removes the placeholder from CMS copy rather than leaving braces behind', () => {
    const map = buildPlaceholders({ ...BASE, shippingDisclaimerEnabled: false })
    const copy = 'Delivery and risk. {{company.shippingDisclaimer}} See our policy.'

    const resolved = resolvePlaceholders(copy, map)
    expect(resolved).not.toContain('{{')
    expect(resolved).toBe('Delivery and risk.  See our policy.')
  })

  it('still leaves UNCONFIGURED placeholders visible — the two cases differ', () => {
    // Disabled on purpose → remove. Simply not filled in → keep it conspicuous.
    const map = buildPlaceholders({ shippingDisclaimerEnabled: false })
    expect(resolvePlaceholders('{{company.shippingDisclaimer}}', map)).toBe('')
    expect(resolvePlaceholders('{{company.phone}}', map)).toBe('{{company.phone}}')
  })
})

describe('the disclaimer text', () => {
  it('states origin, destination, processing and transit', () => {
    const { text } = getShippingDisclaimer(BASE)
    expect(text).toContain('Germany')
    expect(text).toContain('the United States')
    expect(text).toContain('2 business days')
    expect(text).toContain('7–14 days')
  })

  it('quotes the DOOR-TO-DOOR window, not just transit', () => {
    // A customer reads "7–14 days" as time until arrival, not time after an
    // invisible processing step. The gap between those readings is where
    // complaints start, so the total is stated explicitly.
    const result = getShippingDisclaimer(BASE)
    expect(result.totalMinDays).toBe(9)
    expect(result.totalMaxDays).toBe(16)
    expect(result.text).toContain('9–16 days in total')
  })

  it('says nothing is owed on delivery under DDP', () => {
    const { text } = getShippingDisclaimer({ ...BASE, customsHandling: 'ddp' })
    expect(text).toMatch(/duties and import taxes are paid by us/i)
    expect(text).toMatch(/nothing to pay on delivery/i)
  })

  it('warns plainly that duties are payable under DDU', () => {
    const { text } = getShippingDisclaimer({ ...BASE, customsHandling: 'ddu' })
    expect(text).toMatch(/payable by you on delivery/i)
    expect(text).toMatch(/set by customs, not by us/i)
  })

  it('omits customs wording entirely when unspecified', () => {
    const { text } = getShippingDisclaimer({ ...BASE, customsHandling: 'unspecified' })
    expect(text).not.toMatch(/duties/i)
    // The delivery promise is still made.
    expect(text).toContain('7–14 days')
  })

  it('honours a manual override for both long and short forms', () => {
    const override = 'Ships from Berlin. Allow three weeks.'
    const result = getShippingDisclaimer({ ...BASE, shippingDisclaimerOverride: override })
    expect(result.text).toBe(override)
    expect(result.short).toBe(override)
  })

  it('ignores an override that is only whitespace', () => {
    const result = getShippingDisclaimer({ ...BASE, shippingDisclaimerOverride: '   ' })
    expect(result.text).toContain('Germany')
  })

  it('falls back sensibly when the numbers are not configured', () => {
    const result = getShippingDisclaimer({ shippingDisclaimerEnabled: true })
    expect(result.text).toContain('7–14 days')
    expect(result.totalMinDays).toBe(9)
    expect(result.text).not.toContain('undefined')
    expect(result.text).not.toContain('NaN')
  })

  it('pluralises a single processing day', () => {
    const { text } = getShippingDisclaimer({ ...BASE, processingTimeDays: 1 })
    expect(text).toContain('1 business day')
    expect(text).not.toContain('1 business days')
  })

  it('keeps the compact form short enough for the buy box', () => {
    const { short } = getShippingDisclaimer(BASE)
    expect(short.length).toBeLessThan(90)
    expect(short).toContain('Germany')
    expect(short).toContain('9–16 days')
  })
})

describe('agreement across surfaces', () => {
  it('the placeholder and the component render the same sentence', () => {
    // The product page renders the component; policy pages render the
    // placeholder. If these ever diverge the shop contradicts itself.
    const fromComponent = getShippingDisclaimer(BASE).text
    const fromPlaceholder = buildPlaceholders(BASE)['company.shippingDisclaimer']
    expect(fromPlaceholder).toBe(fromComponent)
  })

  it('processing time agrees with the standalone processingTime placeholder', () => {
    const map = buildPlaceholders(BASE)
    expect(map['company.processingTime']).toBe('2 business days')
    expect(map['company.shippingDisclaimer']).toContain('2 business days')
  })
})

describe('the deliveryTimes placeholder — policy pages in both modes', () => {
  it('carries the full cross-border statement when the toggle is ON', () => {
    const map = buildPlaceholders({
      ...BASE,
      shippingDisclaimerEnabled: true,
      shipsFrom: 'Germany',
      shipsTo: 'the United States',
      processingTimeDays: 2,
      deliveryMinDays: 7,
      deliveryMaxDays: 14,
      customsHandling: 'ddp',
    })

    const value = map['company.deliveryTimes']!
    expect(value).toContain('Germany')
    expect(value).toContain('9–16 days')
    expect(value).toContain('duties')
    // Identical to the disclaimer, so the shipping page, FAQ and product page
    // can never disagree about the window.
    expect(value).toBe(map['company.shippingDisclaimer'])
    // And the domestic tiers must be gone.
    expect(value).not.toContain('3–5 business days')
  })

  it('falls back to the domestic tiers when the toggle is OFF — never an empty answer', () => {
    const map = buildPlaceholders({
      ...BASE,
      shippingDisclaimerEnabled: false,
      processingTimeDays: 2,
    })

    const value = map['company.deliveryTimes']!
    expect(value).toContain('2 business days')
    expect(value).toContain('3–5 business days')
    expect(value).not.toContain('Germany')
    expect(value.length).toBeGreaterThan(20)
  })

  it('resolves in CMS copy in both modes — a delivery question is never answerless', () => {
    for (const enabled of [true, false]) {
      const map = buildPlaceholders({ ...BASE, shippingDisclaimerEnabled: enabled })
      const resolved = resolvePlaceholders('How long? {{company.deliveryTimes}}', map)
      expect(resolved).not.toContain('{{')
      expect(resolved.length).toBeGreaterThan('How long? '.length + 10)
    }
  })
})
