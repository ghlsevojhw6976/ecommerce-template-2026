'use client'

import type { DefaultCellComponentProps } from 'payload'

import React from 'react'

/**
 * Colored status pills for the orders list — one component for both the
 * payment `status` and the derived `fulfilmentStatus`, so the list reads at
 * a glance instead of as a column of identical grey words.
 *
 * Color language: green = done, amber = NEEDS ACTION (the one an operator
 * scans for), blue = in flight, red = money went back, grey = nothing left
 * to do. Solid backgrounds with dark text pass contrast in both admin
 * themes.
 */

const STYLES: Record<string, { background: string; color: string; label: string }> = {
  // Payment status
  processing: { background: '#dbeafe', color: '#1e3a8a', label: 'Processing' },
  completed: { background: '#dcfce7', color: '#14532d', label: 'Completed' },
  cancelled: { background: '#e5e7eb', color: '#374151', label: 'Cancelled' },
  refunded: { background: '#fee2e2', color: '#7f1d1d', label: 'Refunded' },
  // Fulfilment status
  needs_shipment: { background: '#fef3c7', color: '#78350f', label: 'Needs shipment' },
  shipped: { background: '#ccfbf1', color: '#134e4a', label: 'Shipped' },
}

export const StatusPill: React.FC<DefaultCellComponentProps> = ({ cellData }) => {
  const value = typeof cellData === 'string' ? cellData : ''
  const style = STYLES[value]

  if (!style) return <span>{value || '—'}</span>

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.02em',
        background: style.background,
        color: style.color,
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
  )
}
