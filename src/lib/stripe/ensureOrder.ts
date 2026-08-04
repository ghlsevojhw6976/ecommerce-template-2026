import type { Payload, PayloadRequest } from 'payload'
import type Stripe from 'stripe'

import { isDispatchable, type PostalAddress } from '@/fields/postalAddress'
import { adjustInventory, adjustmentsFromItems } from './inventory'

/**
 * Idempotently guarantee an order exists for a succeeded PaymentIntent.
 *
 * ── The leak this closes ────────────────────────────────────────────────
 * The normal path is synchronous: the browser confirms the payment, then calls
 * `confirmOrder`, which creates the order. Close the tab in between — or lose
 * signal on mobile — and Stripe has the money while we have no order.
 *
 * ── Why it must be idempotent ───────────────────────────────────────────
 * Stripe retries webhooks until it gets a 2xx and can deliver the same event
 * more than once. The plugin's own `confirmOrder` has NO such guard: call it
 * twice with one PaymentIntent and you get two orders, two inventory
 * decrements, and a customer charged once for a duplicated fulfilment.
 *
 * The guard here is the transaction's `order` field: if it is already set,
 * everything downstream has run and we return without touching anything.
 */

export type EnsureOrderResult = {
  created: boolean
  reason: string
  orderId?: number | string
  transactionId?: number | string
  /** False when the order has no address complete enough to ship to. */
  dispatchable?: boolean
}

export const ensureOrderForPaymentIntent = async ({
  payload,
  paymentIntent,
  req,
  source = 'webhook',
}: {
  payload: Payload
  paymentIntent: Stripe.PaymentIntent
  req?: PayloadRequest
  /** Who asked — only used in logs, so an order's origin story is accurate. */
  source?: 'webhook' | 'checkout'
}): Promise<EnsureOrderResult> => {
  if (paymentIntent.status !== 'succeeded') {
    return { created: false, reason: `PaymentIntent is ${paymentIntent.status}, not succeeded.` }
  }

  // ---- Locate our transaction ------------------------------------------
  const found = await payload.find({
    collection: 'transactions',
    depth: 0,
    limit: 1,
    where: { 'stripe.paymentIntentID': { equals: paymentIntent.id } },
    ...(req ? { req } : {}),
  })

  const transaction = found.docs[0] as Record<string, any> | undefined

  if (!transaction) {
    // A PaymentIntent with no transaction was not created by this shop —
    // another environment sharing the Stripe account, or a dashboard test.
    // Not an error; there is simply nothing here to reconcile.
    return {
      created: false,
      reason: 'No local transaction for this PaymentIntent — not created by this shop.',
    }
  }

  // ---- Idempotency guard ------------------------------------------------
  if (transaction.order) {
    return {
      created: false,
      reason: 'Order already exists for this transaction.',
      orderId: typeof transaction.order === 'object' ? transaction.order.id : transaction.order,
      transactionId: transaction.id,
    }
  }

  // ---- Rebuild the order from the PaymentIntent metadata ----------------
  const meta = paymentIntent.metadata ?? {}
  const cartID = meta.cartID

  let items: unknown
  let shippingAddress: unknown

  try {
    items = meta.cartItemsSnapshot ? JSON.parse(meta.cartItemsSnapshot) : undefined
    shippingAddress = meta.shippingAddress ? JSON.parse(meta.shippingAddress) : undefined
  } catch {
    return { created: false, reason: 'PaymentIntent metadata is not valid JSON.' }
  }

  // Fall back to the transaction's own items — metadata has a 500-char limit
  // per value in Stripe, so a large cart can be truncated.
  if (!Array.isArray(items) || items.length === 0) {
    items = Array.isArray(transaction.items) ? transaction.items : undefined
  }

  // Same for the dispatch address. The durable copy on the transaction (written
  // by enrichStripeTransaction) is authoritative; metadata is only a fallback
  // for transactions created before that hook existed.
  //
  // Test on COMPLETENESS, not truthiness: Payload always materialises a group
  // field as an object with null members, so `!shippingAddress` is never true
  // and a truthiness check would silently prefer an empty address over a
  // complete billing one.
  if (!isDispatchable(shippingAddress as PostalAddress | undefined)) {
    for (const candidate of [transaction.shippingAddress, transaction.billingAddress]) {
      if (isDispatchable(candidate as PostalAddress | undefined)) {
        shippingAddress = candidate
        break
      }
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return {
      created: false,
      reason: 'No line items in PaymentIntent metadata or transaction — cannot build an order.',
    }
  }

  const customerId = transaction.customer
    ? typeof transaction.customer === 'object'
      ? transaction.customer.id
      : transaction.customer
    : undefined

  const customerEmail = transaction.customerEmail ?? undefined

  const order = await payload.create({
    collection: 'orders',
    data: {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency.toUpperCase(),
      ...(customerId ? { customer: customerId } : { customerEmail }),
      items,
      shippingAddress,
      status: 'processing',
      transactions: [transaction.id],
    } as never,
    ...(req ? { req } : {}),
  })

  // Link first: if anything below fails, the idempotency guard is already
  // armed and a retry will not duplicate the order.
  await payload.update({
    collection: 'transactions',
    id: transaction.id,
    data: { order: order.id, status: 'succeeded' } as never,
    ...(req ? { req } : {}),
  })

  // ---- Stock ------------------------------------------------------------
  // The synchronous checkout path decrements stock in its own endpoint, which
  // this flow never reaches — so it has to happen here.
  const stock = await adjustInventory({
    payload,
    adjustments: adjustmentsFromItems(items, 'decrement'),
  })

  const oversold = stock.filter((s) => s.oversold)

  // ---- Mark the cart purchased -----------------------------------------
  // Also unlink it from the customer: the commerce provider re-adopts
  // whatever cart the user's join returns, and a purchased cart re-adopted on
  // the next visit becomes a ghost the customer keeps shopping into. A
  // purchased cart is an archive (its order references it) — nobody's active
  // cart.
  if (cartID) {
    await payload
      .update({
        collection: 'carts',
        id: cartID,
        data: { purchasedAt: new Date().toISOString(), customer: null } as never,
        ...(req ? { req } : {}),
      })
      .catch(() => undefined) // a missing cart must not undo a paid order
  }

  const dispatchable = isDispatchable(shippingAddress as PostalAddress | undefined)

  if (!dispatchable) {
    // Loud, because it is a paid order nobody can fulfil.
    payload.logger.error(
      { orderId: order.id, transactionId: transaction.id, paymentIntent: paymentIntent.id },
      'Order created WITHOUT a usable shipping address — cannot be dispatched',
    )
  }

  payload.logger.info(
    { orderId: order.id, transactionId: transaction.id, paymentIntent: paymentIntent.id },
    source === 'webhook'
      ? 'Order created from Stripe webhook (customer did not complete checkout in-browser)'
      : 'Order created from checkout confirmation',
  )

  const warnings = [
    ...(oversold.length ? [`${oversold.length} item(s) oversold — stock went negative`] : []),
    ...(dispatchable ? [] : ['NO usable shipping address — cannot be dispatched']),
  ]

  return {
    created: true,
    reason: warnings.length
      ? `Order created. WARNING: ${warnings.join('; ')}.`
      : 'Order created from webhook.',
    orderId: order.id,
    transactionId: transaction.id,
    dispatchable,
  }
}
