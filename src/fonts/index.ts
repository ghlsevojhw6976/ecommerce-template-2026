import { Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google'

/**
 * Type system — the single highest-impact decision for not looking generic.
 *
 * The template shipped with Geist, a competent Inter-alike that is also the
 * default of every shadcn project in existence. Replacing it costs nothing at
 * runtime and changes the entire perceived quality of the shop.
 *
 * All three are loaded through `next/font`, which self-hosts them at build
 * time: no request to Google, no render-blocking stylesheet, and no layout
 * shift — which matters because CLS and LCP are conversion metrics, not just
 * Lighthouse points.
 *
 * The pairing follows the editorial/technical direction:
 * see docs/design/2026-07-28-premium-positioning-decision.md
 */

/**
 * Display — Fraunces.
 *
 * A variable serif with real character. Carries premium weight without the
 * fashion-house coldness that would be wrong for a stockpot or a tent. Used for
 * headings, product titles and prices: the editorial half of the page.
 */
export const fontDisplay = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
})

/**
 * Body — Instrument Sans.
 *
 * Clean, slightly condensed neo-grotesque that stays legible at small sizes
 * without being Inter. Carries all running text and interface copy.
 */
export const fontSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

/**
 * Numerals & specs — JetBrains Mono.
 *
 * The technical half. Specification tables, SKUs, dimensions and measurements.
 *
 * Tabular figures are the point: in a product grid, prices should align on the
 * decimal, and monospaced digits in a spec table are the small detail that
 * reads as engineered rather than assembled.
 */
export const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const fontVariables = [fontDisplay.variable, fontSans.variable, fontMono.variable].join(' ')
