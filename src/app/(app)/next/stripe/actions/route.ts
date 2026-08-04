import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { checkRole } from '@/access/utilities'
import { refundTransaction, syncTransactionFromStripe } from '@/lib/stripe/actions'

export const maxDuration = 60

type Body = {
  action?: 'refund' | 'sync'
  transactionId?: number | string
  /** Minor units (cents). Omit for a full refund. */
  amount?: number
}

/**
 * Write actions against Stripe. Admin-only, and refunds are additionally gated
 * on the `allowRefundsFromAdmin` setting so they can be switched off entirely.
 */
export async function POST(req: Request): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!user || !checkRole(['admin'], user)) {
    return new Response('Action forbidden.', { status: 403 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return new Response('Invalid JSON body.', { status: 400 })
  }

  const { action, transactionId, amount } = body

  if (!transactionId) return new Response('transactionId is required.', { status: 400 })

  if (action === 'sync') {
    const result = await syncTransactionFromStripe({ payload, transactionId })
    return Response.json(result, { status: result.ok ? 200 : 400 })
  }

  if (action === 'refund') {
    const settings = await payload.findGlobal({ slug: 'stripe-settings', depth: 0 })
    if (settings?.allowRefundsFromAdmin === false) {
      return Response.json(
        { ok: false, message: 'Refunds from the admin panel are disabled in Stripe settings.' },
        { status: 403 },
      )
    }

    const result = await refundTransaction({
      payload,
      transactionId,
      amountInMinorUnits: amount,
    })

    payload.logger.info(
      { userId: user.id, transactionId, amount, ok: result.ok },
      'Admin refund attempted',
    )

    return Response.json(result, { status: result.ok ? 200 : 400 })
  }

  return new Response('Unknown action. Expected "refund" or "sync".', { status: 400 })
}
