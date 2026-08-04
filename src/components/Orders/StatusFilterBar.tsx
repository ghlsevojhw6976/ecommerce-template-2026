'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React, { useEffect, useState } from 'react'

/**
 * One-click fulfilment-state filters above the orders list — the working
 * queue, without opening the Filters menu. Each pill navigates with the
 * where-query shape Payload's list view both APPLIES and DISPLAYS in its
 * filter UI (verified empirically: where[or][0][and][0][field][equals]).
 *
 * Counts come from the REST count endpoint per state — five cheap indexed
 * SQL counts, refreshed on every list navigation so the numbers can't drift
 * from the table below them.
 */

const STATES = [
  { value: 'needs_shipment', label: 'Needs shipment', background: '#fef3c7', color: '#78350f' },
  { value: 'shipped', label: 'Shipped', background: '#ccfbf1', color: '#134e4a' },
  { value: 'completed', label: 'Completed', background: '#dcfce7', color: '#14532d' },
  { value: 'cancelled', label: 'Cancelled', background: '#e5e7eb', color: '#374151' },
  { value: 'refunded', label: 'Refunded', background: '#fee2e2', color: '#7f1d1d' },
] as const

const whereFor = (value: string): string =>
  `where[or][0][and][0][fulfilmentStatus][equals]=${value}`

export const StatusFilterBar: React.FC = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [counts, setCounts] = useState<Record<string, number | null>>({})
  const [total, setTotal] = useState<number | null>(null)

  const active = searchParams.get('where[or][0][and][0][fulfilmentStatus][equals]')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const results = await Promise.all([
          fetch('/api/orders/count', { credentials: 'include' }).then((res) => res.json()),
          ...STATES.map((state) =>
            fetch(`/api/orders/count?where[fulfilmentStatus][equals]=${state.value}`, {
              credentials: 'include',
            }).then((res) => res.json()),
          ),
        ])
        if (cancelled) return
        setTotal(results[0]?.totalDocs ?? null)
        const next: Record<string, number | null> = {}
        STATES.forEach((state, index) => {
          next[state.value] = results[index + 1]?.totalDocs ?? null
        })
        setCounts(next)
      } catch {
        /* pills render without counts */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  const go = (value: string | null) => {
    router.push(value ? `${pathname}?${whereFor(value)}` : pathname)
  }

  const pill = (
    label: string,
    value: string | null,
    count: number | null,
    colors?: { background: string; color: string },
  ) => {
    const isActive = value === active || (value === null && !active)
    return (
      <button
        key={label}
        onClick={() => go(value)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          borderRadius: '999px',
          border: isActive ? '2px solid var(--theme-elevation-800)' : '2px solid transparent',
          background: colors?.background ?? 'var(--theme-elevation-100)',
          color: colors?.color ?? 'var(--theme-elevation-800)',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
        type="button"
      >
        {label}
        {count !== null && count !== undefined && (
          <span style={{ opacity: 0.75, fontWeight: 700 }}>{count}</span>
        )}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '0 0 1rem' }}>
      {pill('All', null, total)}
      {STATES.map((state) =>
        pill(state.label, state.value, counts[state.value] ?? null, {
          background: state.background,
          color: state.color,
        }),
      )}
    </div>
  )
}
