import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { checkRole } from '@/access/utilities'
import { composeReply } from '@/lib/email/composeReply'
import { getMessage, inboxUnseen, listMessages, type FolderKey } from '@/lib/email/imap'
import {
  emailIsConfigured,
  ensureEmailCredentialsLoaded,
  resolveImapConfig,
  resolveSignature,
} from '@/lib/email/keys'
import { sendShopEmail } from '@/lib/email/transport'

export const maxDuration = 60

/**
 * The admin Mail view's API — one route, three actions (list / message /
 * reply), admin-gated like the merchant preview. Everything talks to the
 * live mailbox; nothing is stored in Postgres.
 *
 * Replies send through the shared SMTP transport with In-Reply-To/References
 * threading headers and are filed to the IMAP Sent folder by sendShopEmail,
 * so the thread stays coherent in any other mail client too.
 */

const authed = async () => {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || !checkRole(['admin'], user)) return { payload, user: null }
  return { payload, user }
}

export async function GET(request: Request): Promise<Response> {
  const { payload, user } = await authed()
  if (!user) return new Response('Action forbidden.', { status: 403 })

  const url = new URL(request.url)
  const action = url.searchParams.get('action') || 'list'
  const folder = (url.searchParams.get('folder') === 'sent' ? 'sent' : 'inbox') as FolderKey

  try {
    await ensureEmailCredentialsLoaded(payload)

    // Nav badges: unfulfilled orders (SQL count) + unread mail (IMAP STATUS).
    // Runs on every admin page via the nav — must stay cheap and never throw.
    if (action === 'badges') {
      const [needsShipment, unseen] = await Promise.all([
        payload
          .count({
            collection: 'orders',
            where: { fulfilmentStatus: { equals: 'needs_shipment' } },
            overrideAccess: true,
          })
          .then((result) => result.totalDocs)
          .catch(() => null),
        resolveImapConfig() ? inboxUnseen(payload) : Promise.resolve(null),
      ])
      return Response.json({ needsShipment, unseen })
    }

    if (!resolveImapConfig()) {
      return Response.json({ configured: false, smtpConfigured: emailIsConfigured() })
    }

    if (action === 'message') {
      const uid = Number(url.searchParams.get('uid'))
      if (!Number.isInteger(uid) || uid <= 0) {
        return new Response('A message uid is required.', { status: 400 })
      }
      const message = await getMessage(payload, { folder, uid })
      if (!message) return new Response('Message not found.', { status: 404 })

      // Link the sender to their order history — the reason this beats webmail.
      let orders: { id: number | string; createdAt: string }[] = []
      if (message.from?.address) {
        const found = await payload.find({
          collection: 'orders',
          depth: 0,
          limit: 5,
          sort: '-createdAt',
          where: { customerEmail: { equals: message.from.address } },
          overrideAccess: true,
        })
        orders = found.docs.map((order) => ({ id: order.id, createdAt: order.createdAt }))
      }

      return Response.json({ configured: true, message, orders })
    }

    const pageRaw = Number(url.searchParams.get('page'))
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1
    const q = url.searchParams.get('q') || undefined

    const result = await listMessages(payload, { folder, page, q })
    return Response.json({ configured: true, ...result })
  } catch (error) {
    payload.logger.error({ err: error }, 'Mail view request failed')
    return new Response(error instanceof Error ? error.message : 'Mail request failed.', {
      status: 500,
    })
  }
}

export async function POST(request: Request): Promise<Response> {
  const { payload, user } = await authed()
  if (!user) return new Response('Action forbidden.', { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return new Response('Invalid request body.', { status: 400 })
  }

  const to = typeof body.to === 'string' ? body.to.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const text = typeof body.body === 'string' ? body.body.trim() : ''

  if (!to || !text) return new Response('Recipient and message are required.', { status: 400 })

  try {
    await ensureEmailCredentialsLoaded(payload)
    const composed = composeReply(text, resolveSignature())
    const result = await sendShopEmail(payload, {
      to,
      subject: subject || '(no subject)',
      html: composed.html,
      text: composed.text,
      ...(typeof body.inReplyTo === 'string' && body.inReplyTo
        ? { inReplyTo: body.inReplyTo }
        : {}),
      ...(typeof body.references === 'string' && body.references
        ? { references: body.references }
        : {}),
    })
    return Response.json({ sent: true, messageId: result.messageId })
  } catch (error) {
    payload.logger.error({ err: error }, 'Admin reply failed to send')
    return new Response(error instanceof Error ? error.message : 'Send failed.', { status: 500 })
  }
}
