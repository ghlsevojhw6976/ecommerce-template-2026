'use client'

import { Banner, Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

/**
 * Settings → Email connection panel: shows which credential source is live
 * (admin / env / none) and sends a real test email to the logged-in admin —
 * credentials that have not delivered a test email are not configured, they
 * are hoped-for.
 */

type Status = {
  source: 'admin' | 'env' | 'none'
  smtp: { host: string; port: number; user: string } | null
  imap: { host: string; port: number; user: string } | null
}

export const EmailHealthPanel: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/next/email/test', { credentials: 'include' })
      if (res.ok) setStatus((await res.json()) as Status)
    } catch {
      /* panel is informational */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sendTest = useCallback(async () => {
    setBusy(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/next/email/test', { method: 'POST', credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as { to: string }
        setResult(`Test email sent to ${data.to} — check that inbox (and its spam folder).`)
      } else {
        setError(await res.text())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div style={{ marginBottom: '2rem' }}>
      {status && (
        <p style={{ marginBottom: '0.75rem' }}>
          {status.source === 'none' ? (
            <em>Not configured — fill in SMTP above (or set SMTP_* env vars) and save.</em>
          ) : (
            <>
              Sending via <code>{status.smtp?.host}</code> as <code>{status.smtp?.user}</code>{' '}
              (source: {status.source}).{' '}
              {status.imap ? (
                <>
                  Inbox reads <code>{status.imap.host}</code>.
                </>
              ) : (
                <em>IMAP not configured — the Mail view will be empty.</em>
              )}
            </>
          )}
        </p>
      )}
      <Button
        buttonStyle="secondary"
        disabled={busy || status?.source === 'none'}
        onClick={() => void sendTest()}
        size="small"
      >
        {busy ? 'Sending…' : 'Send test email to me'}
      </Button>
      {result && <Banner type="success">{result}</Banner>}
      {error && (
        <Banner type="error">
          <strong>Test failed.</strong> {error}
        </Banner>
      )}
    </div>
  )
}
