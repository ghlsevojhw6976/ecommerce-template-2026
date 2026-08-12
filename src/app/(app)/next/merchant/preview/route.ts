import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { checkRole } from '@/access/utilities'
import { buildFeed } from '@/lib/merchant/buildFeed'
import type { MerchantMarket } from '@/lib/merchant/types'
import { getServerSideURL } from '@/utilities/getURL'

export const maxDuration = 60

// Markets are configured in Settings → Google Merchant Center; this only
// covers a shop that has not added one yet. USD/US because the shop itself
// is USD-only (see CLAUDE.md) — the old env-driven fallback is retired.
const FALLBACK_MARKET: MerchantMarket = {
  feedLabel: 'US',
  contentLanguage: 'en',
  currencyCode: 'USD',
}

/**
 * Dry-run feed preview for the admin panel.
 *
 * Builds the Merchant API payload and reports what would be sent. Makes no
 * outbound call to Google and needs no credentials.
 */
export async function POST(): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!user || !checkRole(['admin'], user)) {
    return new Response('Action forbidden.', { status: 403 })
  }

  try {
    const settings = await payload.findGlobal({ slug: 'merchant-center', depth: 0 })

    const configured = (settings?.markets ?? []).find((m) => m?.active)
    const market: MerchantMarket = configured
      ? {
          feedLabel: configured.feedLabel,
          contentLanguage: configured.contentLanguage,
          currencyCode: configured.currencyCode,
          dataSource: configured.dataSource ?? undefined,
        }
      : FALLBACK_MARKET

    const company = await payload.findGlobal({ slug: 'company', depth: 0 })

    const report = await buildFeed({
      payload,
      market,
      serverUrl: getServerSideURL(),
      shippingPolicy: {
        freeShippingThreshold: (company as { freeShippingThreshold?: number | null })
          .freeShippingThreshold,
        flatShippingFee: (company as { flatShippingFee?: number | null }).flatShippingFee,
      },
    })

    // Return counts and a single sample rather than the whole payload — a large
    // catalogue would be megabytes, and the admin only needs the shape.
    return Response.json({
      market: report.market,
      generatedAt: report.generatedAt,
      counts: report.counts,
      skippedByReason: report.skippedByReason,
      skippedProducts: report.skippedProducts.slice(0, 25),
      warnings: report.warnings.slice(0, 25),
      sample: report.inputs[0] ?? null,
    })
  } catch (error) {
    payload.logger.error({ err: error }, 'Merchant feed preview failed')
    return new Response(error instanceof Error ? error.message : 'Preview failed.', { status: 500 })
  }
}
