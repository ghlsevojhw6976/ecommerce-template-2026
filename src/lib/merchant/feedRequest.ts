import crypto from 'crypto'

import config from '@payload-config'
import { getPayload } from 'payload'

import { buildFeed, type FeedReport } from './buildFeed'
import type { MerchantMarket } from './types'
import { companyName, getCompany } from '@/utilities/getCompany'
import { getServerSideURL } from '@/utilities/getURL'

/**
 * Shared plumbing for every public feed route (Google XML, Facebook CSV):
 * token gate (timing-safe against the auto-minted feedToken), active-market
 * resolution, and one mapper run. Adding a channel = one format module and
 * a thin route on top of this.
 */
export const authorizeAndBuildFeed = async (
  request: Request,
): Promise<
  | { authorized: false }
  | { authorized: true; report: FeedReport; shopName: string; serverUrl: string; download: boolean }
> => {
  const payload = await getPayload({ config })

  const settings = await payload
    .findGlobal({ slug: 'merchant-center', depth: 0, overrideAccess: true })
    .catch(() => null)

  const expected = (settings as { feedToken?: string | null } | null)?.feedToken?.trim()
  const url = new URL(request.url)
  const provided = url.searchParams.get('key')?.trim() ?? ''

  const authorized =
    Boolean(expected) &&
    provided.length === expected!.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected!))

  if (!authorized) return { authorized: false }

  const configured = (settings?.markets ?? []).find((market) => market?.active)
  const market: MerchantMarket = configured
    ? {
        feedLabel: configured.feedLabel,
        contentLanguage: configured.contentLanguage,
        currencyCode: configured.currencyCode,
      }
    : { feedLabel: 'US', contentLanguage: 'en', currencyCode: 'USD' }

  const serverUrl = getServerSideURL()
  const company = await getCompany()
  const report = await buildFeed({
    payload,
    market,
    serverUrl,
    shippingPolicy: {
      freeShippingThreshold: company.freeShippingThreshold,
      flatShippingFee: company.flatShippingFee,
    },
  })

  return {
    authorized: true,
    report,
    shopName: companyName(company),
    serverUrl,
    download: url.searchParams.get('download') === '1',
  }
}
