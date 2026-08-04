'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useState } from 'react'

/**
 * "Store" — the operator's section, pinned above Payload's generic
 * collection nav (beforeNavLinks). Dashboard, Orders and Mail are the three
 * places shop-running actually happens; they get distinct styling (accent
 * bar, bolder type) so they never blend into the content-collection list.
 *
 * Badges: unfulfilled orders and unread mail, fetched once on mount and
 * every two minutes from /next/mail?action=badges. Absent on failure —
 * a badge that blocks or errors the nav costs more than it tells.
 */

type Badges = { needsShipment: number | null; unseen: number | null }

const ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '7px 10px',
  textDecoration: 'none',
  color: 'var(--theme-elevation-800)',
  fontWeight: 600,
  fontSize: '13px',
  borderLeft: '3px solid transparent',
}

const Badge: React.FC<{ value: number | null; tone: 'amber' | 'accent' }> = ({ value, tone }) => {
  if (value === null || value === undefined || value <= 0) return null
  return (
    <span
      style={{
        minWidth: '20px',
        textAlign: 'center',
        padding: '1px 7px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 700,
        background: tone === 'amber' ? '#fef3c7' : '#dbeafe',
        color: tone === 'amber' ? '#78350f' : '#1e3a8a',
      }}
    >
      {value > 99 ? '99+' : value}
    </span>
  )
}

export const OpsNav: React.FC = () => {
  const pathname = usePathname()
  const [badges, setBadges] = useState<Badges>({ needsShipment: null, unseen: null })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/next/mail?action=badges', { credentials: 'include' })
        if (res.ok && !cancelled) setBadges((await res.json()) as Badges)
      } catch {
        /* badge stays absent */
      }
    }
    void load()
    const interval = setInterval(() => void load(), 120_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const items = [
    { href: '/admin', label: 'Dashboard', badge: null as React.ReactNode },
    {
      href: '/admin/collections/orders',
      label: 'Orders',
      badge: <Badge tone="amber" value={badges.needsShipment} />,
    },
    { href: '/admin/mail', label: 'Mail', badge: <Badge tone="accent" value={badges.unseen} /> },
  ]

  return (
    <nav aria-label="Store" style={{ marginBottom: '1.25rem' }}>
      <div
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          opacity: 0.55,
          padding: '0 10px 6px',
        }}
      >
        Store
      </div>
      {items.map((item) => {
        const active =
          item.href === '/admin' ? pathname === '/admin' : pathname?.startsWith(item.href)
        return (
          <Link
            href={item.href}
            key={item.href}
            style={{
              ...ITEM_STYLE,
              borderLeftColor: active ? 'var(--theme-elevation-800)' : 'transparent',
              background: active ? 'var(--theme-elevation-100)' : 'transparent',
            }}
          >
            <span>{item.label}</span>
            {item.badge}
          </Link>
        )
      })}
    </nav>
  )
}
