'use client'

import { useEcommerce } from '@payloadcms/plugin-ecommerce/client/react'
import { useEffect, useRef } from 'react'

import { useAuth } from '@/providers/Auth'

/**
 * Connects the auth session to the cart session.
 *
 * The ecommerce provider ships `onLogin` (merges the guest cart into the
 * user's cart, or transfers it) and `onLogout` (clears cart state and
 * localStorage) — but nothing in the template ever called them. The result:
 * a guest's carefully filled cart vanished on login, and on a shared device
 * the NEXT customer inherited the previous user's cart, which is a privacy
 * leak as well as a support ticket.
 *
 * Renders nothing; it only watches the auth status transition. `status` is
 * event-like (set on explicit login/logout, not on session restore), so this
 * fires exactly once per transition.
 */
export const CartSessionBridge: React.FC = () => {
  const { status } = useAuth()
  const { onLogin, onLogout } = useEcommerce()
  const lastHandled = useRef<typeof status>(undefined)

  useEffect(() => {
    if (status === lastHandled.current) return
    lastHandled.current = status

    if (status === 'loggedIn') {
      void onLogin().catch(() => {
        // A failed merge must not break the session — the user keeps
        // whichever cart the provider already has.
      })
    } else if (status === 'loggedOut') {
      onLogout()
    }
  }, [status, onLogin, onLogout])

  return null
}
