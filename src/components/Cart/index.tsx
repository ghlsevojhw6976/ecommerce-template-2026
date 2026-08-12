import React from 'react'

import { CartModal } from './CartModal'
import { Cart as CartType } from '@/payload-types'

export type CartItem = NonNullable<CartType['items']>[number]

export function Cart({
  freeShippingThreshold,
  flatShippingFee,
}: {
  freeShippingThreshold?: number | null
  flatShippingFee?: number | null
}) {
  return (
    <CartModal flatShippingFee={flatShippingFee} freeShippingThreshold={freeShippingThreshold} />
  )
}
