import { authorizeAndBuildFeed } from '@/lib/merchant/feedRequest'
import { buildXmlFeed } from '@/lib/merchant/xmlFeed'

export const maxDuration = 60
// Always fresh: Google fetches once a day, and a stale cached price here is
// exactly the "mismatched value" suspension the whole design avoids.
export const dynamic = 'force-dynamic'

/**
 * The Google Shopping feed — Merchant Center's "scheduled fetch" data
 * source downloads this URL daily. Needs ZERO Google credentials: the
 * template user pastes the tokenized URL (shown in Settings → Google
 * Merchant Center → Export) into Merchant Center and is live.
 *
 * Same mapper as the API preview (`mapProduct`), so every policy gate —
 * the affiliate exclusion above all — holds identically here. With
 * ?download=1 it doubles as the admin's file export.
 */
export async function GET(request: Request): Promise<Response> {
  const result = await authorizeAndBuildFeed(request)
  if (!result.authorized) return new Response('Not found.', { status: 404 })

  const xml = buildXmlFeed({
    inputs: result.report.inputs,
    shopName: result.shopName,
    serverUrl: result.serverUrl,
  })

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
      // Never in the index, even if the tokenized URL leaks. A response
      // header (not robots.txt) so Merchant Center's fetcher is unaffected.
      'X-Robots-Tag': 'noindex',
      ...(result.download
        ? { 'Content-Disposition': 'attachment; filename="google-shopping.xml"' }
        : {}),
    },
  })
}
