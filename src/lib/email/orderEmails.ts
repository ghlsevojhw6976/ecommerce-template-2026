import type { CollectionAfterChangeHook } from 'payload'

import type { Order } from '@/payload-types'

import { getServerSideURL } from '@/utilities/getURL'
import { orderConfirmationEmail, orderShippedEmail } from './templates'
import { emailReady, sendShopEmail } from './transport'

/**
 * The two customer emails, driven from the orders collection so EVERY path
 * that produces an order converges here — webhook fulfilment, the
 * return-page confirm, even a hand-created admin order.
 *
 * Idempotency stamps (`confirmationEmailSentAt` / `trackingEmailSentAt`) are
 * the guard, same doctrine as the stripe-events ledger: Stripe retries,
 * admins double-save, hooks re-fire — the customer gets each email once.
 * When email is NOT configured the stamp is deliberately NOT written, so
 * configuring the mailbox later (or fixing broken credentials) lets the next
 * save send what was missed instead of pretending it went out.
 *
 * A send failure logs and returns — an email must never fail an order write:
 * the money has already moved.
 */

const stamp = async (
  hookArgs: Parameters<CollectionAfterChangeHook>[0],
  field: 'confirmationEmailSentAt' | 'trackingEmailSentAt',
): Promise<void> => {
  await hookArgs.req.payload.update({
    collection: 'orders',
    id: hookArgs.doc.id,
    data: { [field]: new Date().toISOString() },
    // The context flag stops this update from re-entering the hook.
    context: { skipOrderEmails: true },
    overrideAccess: true,
    // CRITICAL: join the hook's own transaction. Without `req` this opens a
    // SECOND transaction that blocks on the order row the outer, uncommitted
    // transaction holds — a self-deadlock that hangs the save forever
    // (found the hard way: 10+ minutes of two frozen Postgres backends).
    req: hookArgs.req,
  })
}

export const sendOrderEmails: CollectionAfterChangeHook = async (args) => {
  const { doc, previousDoc, operation, req } = args
  const { payload, context } = req

  if (context?.skipOrderEmails || context?.disableRevalidate) return doc

  const order = doc as Order
  if (!order.customerEmail) return doc
  if (order.status === 'cancelled' || order.status === 'refunded') return doc

  // ---- Confirmation: once, when the order comes into existence ------------
  const needsConfirmation = operation === 'create' && !order.confirmationEmailSentAt

  // ---- Shipped: when a tracking number appears or changes -----------------
  const tracking = (order as Record<string, any>).trackingNumber?.trim?.() || null
  const previousTracking =
    (previousDoc as Record<string, any> | undefined)?.trackingNumber?.trim?.() || null
  const needsShipped = Boolean(tracking) && tracking !== previousTracking

  if (!needsConfirmation && !needsShipped) return doc

  try {
    if (!(await emailReady(payload))) {
      payload.logger.warn(
        { orderId: order.id },
        'Order email skipped: no mailbox configured (Settings → Email). It will send on the next save after configuration.',
      )
      return doc
    }

    // Hook docs carry relationship IDs; the templates need titles and
    // prices — fetch once at depth 2 (products resolve via defaultPopulate).
    // `req` is mandatory here: on CREATE the order row is not committed yet,
    // and a fetch outside the operation's transaction gets NotFound.
    const full = (await payload.findByID({
      collection: 'orders',
      id: order.id,
      depth: 2,
      overrideAccess: true,
      req,
    })) as Order

    // depth 1: the email shell renders the logo mark — at depth 0 logoMark
    // is an ID and the email silently loses its logo.
    const company = await payload
      .findGlobal({ slug: 'company', depth: 1 })
      .catch(() => ({}) as never)
    const serverUrl = getServerSideURL()

    if (needsConfirmation) {
      const message = orderConfirmationEmail({ order: full, company, serverUrl })
      await sendShopEmail(payload, {
        to: order.customerEmail,
        subject: message.subject,
        html: message.html,
      })
      await stamp(args, 'confirmationEmailSentAt')
      payload.logger.info({ orderId: order.id }, 'Order confirmation email sent')
    }

    if (needsShipped && tracking) {
      const message = orderShippedEmail({
        order: full,
        company,
        serverUrl,
        trackingNumber: tracking,
        carrier: (order as Record<string, any>).carrier,
      })
      await sendShopEmail(payload, {
        to: order.customerEmail,
        subject: message.subject,
        html: message.html,
      })
      await stamp(args, 'trackingEmailSentAt')
      payload.logger.info({ orderId: order.id }, 'Tracking email sent')
    }
  } catch (error) {
    payload.logger.error(
      { err: error, orderId: order.id },
      'Order email failed — the order itself is unaffected',
    )
  }

  return doc
}
