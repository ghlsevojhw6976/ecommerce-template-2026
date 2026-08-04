import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { checkRole } from '@/access/utilities'
import { seedPolicies } from '@/endpoints/seed/policies'

export const maxDuration = 120

/**
 * Installs the boilerplate policy pages into this shop.
 *
 * Existing pages are skipped unless `overwrite` is passed — running this on a
 * shop that has already edited its returns policy must not destroy that work.
 */
export async function POST(req: Request): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!user || !checkRole(['admin'], user)) {
    return new Response('Action forbidden.', { status: 403 })
  }

  let overwrite = false
  try {
    overwrite = Boolean(((await req.json()) as { overwrite?: boolean })?.overwrite)
  } catch {
    // No body is fine — default to the safe path.
  }

  try {
    const result = await seedPolicies({ payload, overwrite })
    return Response.json({ ok: true, ...result })
  } catch (error) {
    payload.logger.error({ err: error }, 'Policy page seeding failed')
    return new Response(error instanceof Error ? error.message : 'Seeding failed.', { status: 500 })
  }
}
