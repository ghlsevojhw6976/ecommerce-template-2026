import type { Product, Variant } from '@/payload-types'

/**
 * Price/stock validation run by the plugin at payment initiation, for every
 * line item in the cart.
 *
 * This exists because the plugin's OWN variant validation is unreachable dead
 * code: in `defaultProductsValidation` the variant branch sits inside
 * `if (!item.variant)`, so a variant item is never checked against its
 * variant's price or inventory (CLAUDE.md §4d, known-bugs table). With 17
 * imported products carrying variants, "never validated at checkout" stopped
 * being theoretical.
 *
 * Contract (from the plugin's ProductsValidation type): throw to reject the
 * checkout; the endpoint catches and returns a 400 with the message.
 */
export const validateProducts = ({
  product,
  quantity,
  variant,
}: {
  currenciesConfig?: unknown
  currency?: string
  product: Product
  quantity: number
  variant?: Variant
}): void => {
  if (!quantity || quantity < 1) {
    throw new Error('Invalid quantity.', { cause: { code: 'InvalidQuantity' } })
  }

  if (variant) {
    const price = variant.priceInUSD

    if (typeof price !== 'number' || price <= 0) {
      throw new Error(`"${product.title}" is not available in this option right now.`, {
        cause: { code: 'NoPrice' },
      })
    }

    if (typeof variant.inventory === 'number' && variant.inventory < quantity) {
      throw new Error(`Not enough stock of "${product.title}" in the selected option.`, {
        cause: { code: 'OutOfStock' },
      })
    }

    return
  }

  const price = product.priceInUSD

  if (typeof price !== 'number' || price <= 0) {
    throw new Error(`"${product.title}" is not available right now.`, {
      cause: { code: 'NoPrice' },
    })
  }

  if (typeof product.inventory === 'number' && product.inventory < quantity) {
    throw new Error(`Not enough stock of "${product.title}".`, {
      cause: { code: 'OutOfStock' },
    })
  }
}
