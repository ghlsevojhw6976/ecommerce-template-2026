import type { Payload } from 'payload'

import type { Product } from '@/payload-types'
import { gmcAnnotationWarnings } from '@/lib/commerce/discount'
import type { ShippingPolicy } from '@/lib/commerce/shipping'
import { mapProduct } from './mapProduct'
import type { MerchantMarket, MerchantProductInput } from './types'

/**
 * Builds the set of ProductInputs for a market and reports exactly what was
 * withheld and why.
 *
 * Deliberately does no network I/O — this is the dry run. It answers "what
 * would we send to Google?" so the answer can be reviewed in the admin before
 * any credentials exist.
 */

export type FeedReport = {
  market: MerchantMarket
  generatedAt: string
  counts: {
    total: number
    included: number
    skipped: number
  }
  /** Reason -> number of products withheld for it. */
  skippedByReason: Record<string, number>
  /** Which products were withheld, so the admin can act on them. */
  skippedProducts: { offerId: string; reason: string }[]
  /**
   * Included but imperfect — sale annotations that won't show (≤5% or >90%
   * off), stale sales past their end date, sales old enough to threaten the
   * base-price rules. Warnings, never skips: all are valid submissions.
   */
  warnings: { offerId: string; warnings: string[] }[]
  inputs: MerchantProductInput[]
}

export type BuildFeedArgs = {
  payload: Payload
  market: MerchantMarket
  serverUrl: string
  /** Cap for the admin preview. Omit for a full run. */
  limit?: number
  /** Company.freeShippingThreshold / .flatShippingFee — passed through to mapProduct for the per-offer <g:shipping> element. */
  shippingPolicy?: ShippingPolicy
}

export const buildFeed = async ({
  payload,
  market,
  serverUrl,
  limit,
  shippingPolicy,
}: BuildFeedArgs): Promise<FeedReport> => {
  // Fetch everything rather than pre-filtering on feedEligible: the value of
  // this report is largely in telling the admin WHY products are missing from
  // Shopping. depth 1 resolves media and supplier relationships.
  const { docs } = await payload.find({
    collection: 'products',
    depth: 1,
    limit: limit ?? 0,
    pagination: false,
    draft: false,
  })

  const inputs: MerchantProductInput[] = []
  const skippedProducts: { offerId: string; reason: string }[] = []
  const skippedByReason: Record<string, number> = {}
  const warnings: { offerId: string; warnings: string[] }[] = []

  for (const doc of docs as Product[]) {
    const result = mapProduct({ product: doc, market, serverUrl, shippingPolicy })

    if (result.ok) {
      inputs.push(result.input)
      const productWarnings = gmcAnnotationWarnings(doc)
      if (productWarnings.length) {
        warnings.push({ offerId: result.input.offerId, warnings: productWarnings })
      }
    } else {
      skippedProducts.push({ offerId: result.offerId, reason: result.reason })
      skippedByReason[result.reason] = (skippedByReason[result.reason] ?? 0) + 1
    }
  }

  return {
    market,
    generatedAt: new Date().toISOString(),
    counts: {
      total: docs.length,
      included: inputs.length,
      skipped: skippedProducts.length,
    },
    skippedByReason,
    skippedProducts,
    warnings,
    inputs,
  }
}
