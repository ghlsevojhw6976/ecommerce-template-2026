'use client'

import { usePreferences } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

/**
 * Advisory dashboard warnings the operator can dismiss — for tasks whose
 * completion the shop cannot fully verify itself (pasting the feed URL into
 * Merchant Center happens on Google's side; only a human knows when the
 * company details are the real ones).
 *
 * Dismissals persist in Payload's per-user preferences — the same store the
 * admin uses for column layouts — so they survive devices and sessions,
 * and a second admin still sees the warnings until they dismiss them.
 */

export type AdvisoryWarning = {
  key: string
  title: string
  why: string
  href: string
  cta: string
}

const PREF_KEY = 'dashboard-dismissed-warnings'

export const DismissibleWarnings: React.FC<{ warnings: AdvisoryWarning[] }> = ({ warnings }) => {
  const { getPreference, setPreference } = usePreferences()
  const [dismissed, setDismissed] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    void getPreference<Record<string, boolean>>(PREF_KEY)
      .then((value) => setDismissed(value ?? {}))
      .catch(() => setDismissed({}))
  }, [getPreference])

  // Render nothing until the preference loads — a banner that flashes and
  // vanishes reads as a glitch, not as information.
  if (dismissed === null) return null

  const visible = warnings.filter((warning) => !dismissed[warning.key])
  if (visible.length === 0) return null

  const dismiss = (key: string) => {
    const next = { ...dismissed, [key]: true }
    setDismissed(next)
    void setPreference(PREF_KEY, next, true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.5rem' }}>
      {visible.map((warning) => (
        <div
          key={warning.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            border: '1px solid #f0d9a8',
            background: '#fef7e6',
            padding: '12px 16px',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#78350f' }}>
              {warning.title}
            </div>
            <div style={{ fontSize: '13px', color: '#92600f', marginTop: '2px' }}>
              {warning.why}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <a
              href={warning.href}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#78350f',
                textDecoration: 'underline',
              }}
            >
              {warning.cta}
            </a>
            <button
              aria-label={`Dismiss: ${warning.title}`}
              onClick={() => dismiss(warning.key)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#92600f',
                fontSize: '18px',
                lineHeight: 1,
                cursor: 'pointer',
                padding: '2px 4px',
              }}
              title="Dismiss"
              type="button"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
