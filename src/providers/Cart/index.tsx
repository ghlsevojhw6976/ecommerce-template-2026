'use client'

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * UI state for the cart drawer.
 *
 * Exists so that ANY component can open the drawer — most importantly
 * Add to cart. Before this, the drawer's open flag was private to the header
 * button, so adding an item produced no visible response beyond a counter
 * changing in the corner of the page: the customer's eyes are on the button
 * they just clicked, and nothing near it moves.
 *
 * Opening the drawer is also the honest feedback: it renders from provider
 * state, so it shows what is actually in the cart rather than asserting
 * "Item added" on a promise that resolves even on failure.
 */

type CartUIContext = {
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
  setOpen: (open: boolean) => void
}

const Context = createContext<CartUIContext>({
  isOpen: false,
  openCart: () => {},
  closeCart: () => {},
  setOpen: () => {},
})

export const CartUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setOpen] = useState(false)

  const openCart = useCallback(() => setOpen(true), [])
  const closeCart = useCallback(() => setOpen(false), [])

  const value = useMemo(
    () => ({ isOpen, openCart, closeCart, setOpen }),
    [isOpen, openCart, closeCart],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const useCartUI = (): CartUIContext => useContext(Context)
