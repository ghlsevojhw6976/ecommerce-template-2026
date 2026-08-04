import type { Payload } from 'payload'

/**
 * Carries a purchased cart's CURRENT items into a fresh cart.
 *
 * Why this exists: a cart is marked `purchasedAt` server-side the moment its
 * order is created — but the browser that holds its id may never learn that.
 * The customer pays on Stripe and closes the tab before the return page (which
 * is what clears the client cart), or pays on another device, and their next
 * visit happily keeps shopping INTO the dead cart. Refusing them at checkout
 * with "already purchased" punishes the customer for our bookkeeping.
 *
 * So checkout revives instead of refusing: whatever the dead cart holds right
 * now — which is exactly what the customer sees in their drawer — moves to a
 * fresh cart, and the session is created for that. The purchased cart stays
 * untouched as the immutable record its order references. Charging the same
 * cart twice remains impossible, and the customer never sees any of it.
 */
export const revivePurchasedCart = async ({
  payload,
  cart,
}: {
  payload: Payload
  cart: Record<string, any>
}): Promise<{ cart: Record<string, any>; secret?: string }> => {
  const items = (Array.isArray(cart.items) ? cart.items : []).map(
    (item: Record<string, any>) => ({
      product: typeof item.product === 'object' ? item.product?.id : item.product,
      ...(item.variant
        ? { variant: typeof item.variant === 'object' ? item.variant?.id : item.variant }
        : {}),
      quantity: item.quantity,
    }),
  )

  const ownerID =
    cart.customer && typeof cart.customer === 'object' ? cart.customer.id : cart.customer

  const fresh = (await payload.create({
    collection: 'carts',
    depth: 0,
    data: {
      items,
      ...(cart.currency ? { currency: cart.currency } : {}),
      ...(ownerID ? { customer: ownerID } : {}),
    } as never,
    overrideAccess: true,
  })) as Record<string, any>

  // The plugin's beforeChange mints a guest secret on create and its afterRead
  // exposes it exactly once, on the create response. Belt-and-braces: if this
  // runtime path didn't carry it through, read it back with overrideAccess
  // (which bypasses the field's read:false).
  let secret: string | undefined = typeof fresh.secret === 'string' ? fresh.secret : undefined

  if (!secret) {
    const reread = (await payload
      .findByID({ collection: 'carts', id: fresh.id, depth: 0, overrideAccess: true })
      .catch(() => null)) as Record<string, any> | null
    secret = typeof reread?.secret === 'string' ? reread.secret : undefined
  }

  payload.logger.info(
    { deadCartId: cart.id, freshCartId: fresh.id, items: items.length },
    'Revived a purchased cart at checkout (client was still holding the old id)',
  )

  return { cart: fresh, secret }
}
