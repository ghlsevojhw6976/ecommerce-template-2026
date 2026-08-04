import type { Payload } from 'payload'

import { validateProducts } from '@/lib/commerce/validateProducts'

/**
 * The ephemeral cart behind "Buy now with Stripe".
 *
 * Buy now means THIS item, right now — the convention Amazon fixed in every
 * shopper's head. The customer's real cart must not be spent, drained, or
 * even touched: a customer clicking Buy now on one product while $2,000 of
 * other items sit in their cart is not asking to be charged $2,500.
 *
 * So the purchase happens through a single-item cart minted here and used
 * once. Deliberately created with NO customer even for logged-in buyers: the
 * commerce provider adopts whatever cart the user's join returns, and an
 * abandoned buy-now cart linked to an account could hijack the drawer on
 * their next visit. Attribution still works — the transaction and order carry
 * the customer. If the customer never pays, the session expires and the cart
 * is inert data.
 *
 * Throws validateProducts' typed errors (OutOfStock, NoPrice…) — the route
 * turns them into 400s, same as the cart path.
 */
export const createBuyNowCart = async ({
  payload,
  productID,
  quantity = 1,
}: {
  payload: Payload
  productID: number | string
  quantity?: number
}): Promise<{ cart: Record<string, any>; productSlug?: string }> => {
  const product = (await payload
    .findByID({ collection: 'products', id: productID, depth: 0 })
    .catch(() => null)) as Record<string, any> | null

  if (!product) {
    throw new Error('This product is no longer available.', { cause: { code: 'NotFound' } })
  }

  // Validate BEFORE creating anything — an invalid request must not leave an
  // orphan cart behind. Colour/size siblings are separate products, so there
  // is no variant dimension here any more.
  validateProducts({ product: product as never, quantity })

  const cart = (await payload.create({
    collection: 'carts',
    depth: 0,
    data: {
      items: [{ product: productID, quantity }],
      currency: 'USD',
    } as never,
    overrideAccess: true,
  })) as Record<string, any>

  return { cart, productSlug: typeof product.slug === 'string' ? product.slug : undefined }
}
