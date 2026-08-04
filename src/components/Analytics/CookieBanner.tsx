'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { applyConsent, readConsent } from '@/lib/analytics/consent'

/**
 * Small bottom consent bar — deliberately quiet: one sentence, two actions,
 * no modal, nothing blocked. Renders only while no choice is stored (the
 * cookie is read after mount, so returning visitors never see a flash).
 *
 * Accept upgrades Google Consent Mode to granted; Decline records the choice
 * and leaves the default denial standing — GA keeps receiving cookieless
 * pings either way, which is the entire point of Consent Mode. A decline
 * option isn't optional decoration: consent that cannot be refused isn't
 * consent, and EU enforcement treats accept-only banners as invalid.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(readConsent() === null)
  }, [])

  if (!visible) return null

  const decide = (state: 'granted' | 'denied') => {
    applyConsent(state)
    setVisible(false)
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card p-4 shadow-[var(--elevation-overlay)]"
      role="region"
      aria-label="Cookie consent"
    >
      <div className="container flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use cookies to understand how the shop is used and improve it. See our{' '}
          <Link className="text-foreground underline underline-offset-4" href="/privacy">
            privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => decide('denied')} size="sm" variant="ghost">
            Decline
          </Button>
          <Button onClick={() => decide('granted')} size="sm" variant="default">
            Accept
          </Button>
        </div>
      </div>
    </div>
  )
}
