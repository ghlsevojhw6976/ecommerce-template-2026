import type { Order } from '@/payload-types'

import { centsToGa, gaItem, itemsValue, type GaPurchase } from './items'

/**
 * Build the GA4 purchase payload from an order — pure, server-side, called by
 * the confirm endpoint so the confirmation page can fire `purchase` with real
 * data (line items, discounts, charged total) instead of re-deriving any of
 * it client-side.
 *
 * `transaction_id` is the order id — stable across refreshes, which is what
 * the client-side once-guard and GA's own dedupe both key on. `value` prefers
 * the order's charged `amount` (cents) over summing line prices: the charge
 * is the truth, line math is the fallback.
 *
 * Relation-resolved products here pass through defaultPopulate — slug, title,
 * priceInUSD and compareAtPriceInUSD survive it (they are in the populate
 * list), which is all gaItem needs. Products that failed to resolve (deleted
 * since purchase) are skipped rather than emitted as empty items.
 */
export const orderToGaPurchase = (order: Order): GaPurchase => {
  const items = (order.items ?? [])
    .filter((line) => line.product && typeof line.product === 'object')
    .map((line) => gaItem(line.product as never, line.quantity || 1))

  const value =
    typeof order.amount === 'number' && order.amount > 0
      ? centsToGa(order.amount)
      : itemsValue(items)

  return {
    transaction_id: String(order.id),
    value,
    currency: order.currency || 'USD',
    items,
  }
}
