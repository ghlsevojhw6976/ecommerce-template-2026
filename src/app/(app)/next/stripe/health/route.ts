import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { checkRole } from '@/access/utilities'
import { getStripeHealth } from '@/lib/stripe/health'
import { ensureStripeCredentialsLoaded } from '@/lib/stripe/keys'

export async function GET(): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!user || !checkRole(['admin'], user)) {
    return new Response('Action forbidden.', { status: 403 })
  }

  await ensureStripeCredentialsLoaded(payload)

  return Response.json(await getStripeHealth())
}
