import { Product } from '@/payload-types'

/**
 * Scarcity, honestly: shows only when stock is genuinely low or gone.
 * Colour/size siblings are separate products, so the count is always the
 * page's own — there is no selected-variant state any more.
 */
export const StockIndicator: React.FC<{ product: Product }> = ({ product }) => {
  const stockQuantity = product.inventory || 0

  return (
    <div className="uppercase font-mono text-sm font-medium text-gray-500">
      {stockQuantity < 10 && stockQuantity > 0 && <p>Only {stockQuantity} left in stock</p>}
      {(stockQuantity === 0 || !stockQuantity) && <p>Out of stock</p>}
    </div>
  )
}
