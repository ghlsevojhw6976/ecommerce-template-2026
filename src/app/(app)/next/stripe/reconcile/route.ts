import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { checkRole } from '@/access/utilities'
import { reconcile } from '@/lib/stripe/reconcile'

export const maxDuration = 120

export async function POST(): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!user || !checkRole(['admin'], user)) {
    return new Response('Action forbidden.', { status: 403 })
  }

  try {
    const settings = await payload.findGlobal({ slug: 'stripe-settings', depth: 0 })
    const limit = typeof settings?.reconcileLimit === 'number' ? settings.reconcileLimit : 100

    return Response.json(await reconcile({ payload, limit }))
  } catch (error) {
    payload.logger.error({ err: error }, 'Stripe reconciliation failed')
    return new Response(error instanceof Error ? error.message : 'Reconcile failed.', {
      status: 500,
    })
  }
}
