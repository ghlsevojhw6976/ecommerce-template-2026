import { buildFacebookCsv } from '@/lib/merchant/csvFeed'
import { authorizeAndBuildFeed } from '@/lib/merchant/feedRequest'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Facebook (Meta) catalog feed — same mapper, same token, CSV format.
 * Use as a scheduled-fetch URL in Meta Commerce Manager, or with
 * ?download=1 as a file export from the admin's Export tab.
 */
export async function GET(request: Request): Promise<Response> {
  const result = await authorizeAndBuildFeed(request)
  if (!result.authorized) return new Response('Not found.', { status: 404 })

  const csv = buildFacebookCsv(result.report.inputs)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
      // Never in the index, even if the tokenized URL leaks. A response
      // header (not robots.txt) so the platform fetchers are unaffected.
      'X-Robots-Tag': 'noindex',
      ...(result.download
        ? { 'Content-Disposition': 'attachment; filename="facebook-catalog.csv"' }
        : {}),
    },
  })
}
