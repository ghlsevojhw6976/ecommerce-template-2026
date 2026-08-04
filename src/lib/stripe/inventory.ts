import type { Payload } from 'payload'

import { revalidateProductPaths } from '@/hooks/revalidateStorefront'

/**
 * Atomic inventory adjustment.
 *
 * ── Why not payload.db.updateOne with $inc ──────────────────────────────
 * The plugin's own checkout path decrements stock with `{ inventory: { $inc: n } }`.
 * That is MongoDB syntax. We run Postgres, where `$inc` is not an operator —
 * so we do the arithmetic in SQL instead.
 *
 * ── Why raw SQL rather than read-then-write ─────────────────────────────
 * Read-modify-write loses concurrent decrements: two checkouts reading stock=1
 * at the same moment both write 0, and one unit is oversold. A single
 * `SET inventory = inventory - $1` is atomic, so concurrent orders serialise
 * correctly at the row level.
 *
 * Stock is allowed to go negative on purpose. The payment has already
 * succeeded — refusing the decrement would leave the database claiming stock we
 * do not have. Recording the true (negative) figure and flagging the oversell
 * is the honest outcome.
 */

const TABLES = {
  products: 'products',
  variants: 'variants',
} as const

export type StockAdjustment = {
  collection: keyof typeof TABLES
  id: number | string
  /** Positive decrements stock; negative restocks (e.g. on refund). */
  decrementBy: number
}

export type StockResult = {
  collection: string
  id: number | string
  newInventory: number | null
  oversold: boolean
  applied: boolean
}

export const adjustInventory = async ({
  payload,
  adjustments,
}: {
  payload: Payload
  adjustments: StockAdjustment[]
}): Promise<StockResult[]> => {
  const results: StockResult[] = []

  // `pool` is the node-postgres Pool exposed by @payloadcms/db-postgres.
  const pool = (payload.db as unknown as { pool?: { query: Function } }).pool

  for (const adj of adjustments) {
    const table = TABLES[adj.collection]

    if (!table || !adj.id || !Number.isFinite(adj.decrementBy) || adj.decrementBy === 0) {
      results.push({
        collection: String(adj.collection),
        id: adj.id,
        newInventory: null,
        oversold: false,
        applied: false,
      })
      continue
    }

    if (!pool?.query) {
      // No pool means a non-Postgres adapter. Fail loudly rather than silently
      // skipping stock control.
      payload.logger.error(
        { collection: adj.collection, id: adj.id },
        'Inventory adjustment skipped: no Postgres pool on payload.db',
      )
      results.push({
        collection: String(adj.collection),
        id: adj.id,
        newInventory: null,
        oversold: false,
        applied: false,
      })
      continue
    }

    try {
      // Table name comes from the fixed TABLES map above, never user input.
      const { rows } = await pool.query(
        `UPDATE "${table}" SET inventory = COALESCE(inventory, 0) - $1 WHERE id = $2 RETURNING inventory`,
        [adj.decrementBy, adj.id],
      )

      // Payload number fields are `numeric` in Postgres, and node-postgres
      // returns numeric as a STRING to preserve precision. Coerce explicitly —
      // a `typeof === 'number'` check here silently never fires.
      const raw = rows?.[0]?.inventory
      const parsed = raw === null || raw === undefined ? null : Number(raw)
      const newInventory = parsed !== null && Number.isFinite(parsed) ? parsed : null
      const oversold = newInventory !== null && newInventory < 0

      if (oversold) {
        payload.logger.warn(
          { collection: adj.collection, id: adj.id, newInventory },
          'Oversold: inventory went negative after a paid order',
        )
      }

      results.push({
        collection: String(adj.collection),
        id: adj.id,
        newInventory,
        oversold,
        applied: (rows?.length ?? 0) > 0,
      })
    } catch (error) {
      payload.logger.error(
        { err: error, collection: adj.collection, id: adj.id },
        'Inventory adjustment failed',
      )
      results.push({
        collection: String(adj.collection),
        id: adj.id,
        newInventory: null,
        oversold: false,
        applied: false,
      })
    }
  }

  // PDPs are static — a raw-SQL stock change fires no Payload hook, so the
  // purge happens here. Slug lookup failure must never fail the adjustment:
  // the money moved; a stale stock badge self-heals on the hourly fallback.
  const productIds = results
    .filter((result) => result.applied && result.collection === 'products')
    .map((result) => result.id)
  if (productIds.length) {
    try {
      const { docs } = await payload.find({
        collection: 'products',
        depth: 0,
        limit: productIds.length,
        pagination: false,
        select: { slug: true },
        where: { id: { in: productIds } },
      })
      revalidateProductPaths(docs.map((doc) => (doc as { slug?: string | null }).slug))
    } catch {
      // covered by the time-based revalidate
    }
  }

  return results
}

/** Turns order/transaction line items into stock adjustments. */
export const adjustmentsFromItems = (
  items: unknown,
  direction: 'decrement' | 'restock' = 'decrement',
): StockAdjustment[] => {
  if (!Array.isArray(items)) return []
  const sign = direction === 'decrement' ? 1 : -1

  return items
    .map((item): StockAdjustment | null => {
      const quantity = Number((item as Record<string, any>)?.quantity ?? 0)
      if (!quantity) return null

      const variant = (item as Record<string, any>)?.variant
      const product = (item as Record<string, any>)?.product

      // A variant carries its own stock, so it takes precedence.
      if (variant) {
        const id = typeof variant === 'object' ? variant.id : variant
        return id ? { collection: 'variants', id, decrementBy: quantity * sign } : null
      }
      if (product) {
        const id = typeof product === 'object' ? product.id : product
        return id ? { collection: 'products', id, decrementBy: quantity * sign } : null
      }
      return null
    })
    .filter((a): a is StockAdjustment => a !== null)
}
