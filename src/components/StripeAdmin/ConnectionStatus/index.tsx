'use client'

import { Banner, Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import './index.scss'

const baseClass = 'stripe-connection'

type Health = {
  connected: boolean
  mode: 'live' | 'test' | 'unset'
  keyMasked: string
  keySource?: 'admin' | 'env' | 'none'
  accountId?: string
  accountName?: string
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  webhookSecretConfigured: boolean
  webhookEndpoints: { id: string; url: string; status: string; enabledEvents: number }[]
  lastEventAt?: string
  lastEventType?: string
  pendingWebhookEvents: number
  error?: string
}

const relative = (iso?: string): string => {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export const ConnectionStatus: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/next/stripe/health', { credentials: 'include' })
      setHealth(res.ok ? ((await res.json()) as Health) : null)
    } catch {
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !health) return <p className={`${baseClass}__loading`}>Checking Stripe…</p>

  if (!health) {
    return <Banner type="error">Could not load Stripe status.</Banner>
  }

  const staleEvents =
    health.lastEventAt && Date.now() - new Date(health.lastEventAt).getTime() > 7 * 864e5

  return (
    <div className={baseClass}>
      <div className={`${baseClass}__head`}>
        <h3>Connection</h3>
        <Button buttonStyle="secondary" onClick={load} size="small">
          Refresh
        </Button>
      </div>

      {/* Live mode is called out loudly — this panel can issue real refunds. */}
      {health.mode === 'live' ? (
        <Banner type="error">
          <strong>LIVE MODE</strong> — actions here move real money.
        </Banner>
      ) : health.mode === 'test' ? (
        <Banner type="success">
          <strong>TEST MODE</strong> — safe to experiment.
        </Banner>
      ) : (
        <Banner type="info">No Stripe key configured.</Banner>
      )}

      {health.error && (
        <Banner type="error">
          <strong>Stripe error.</strong> {health.error}
        </Banner>
      )}

      <dl className={`${baseClass}__grid`}>
        <div>
          <dt>Account</dt>
          <dd>{health.accountName || health.accountId || '—'}</dd>
        </div>
        <div>
          <dt>Secret key</dt>
          <dd>
            <code>{health.keyMasked}</code>{' '}
            {health.keySource && health.keySource !== 'none' && (
              <span className="muted">
                {health.keySource === 'admin' ? 'from admin settings' : 'from environment'}
              </span>
            )}{' '}
            {health.connected ? <span className="ok">valid</span> : <span className="bad">unverified</span>}
          </dd>
        </div>
        <div>
          <dt>Charges</dt>
          <dd className={health.chargesEnabled ? 'ok' : 'bad'}>
            {health.chargesEnabled ? 'enabled' : 'disabled'}
          </dd>
        </div>
        <div>
          <dt>Webhook secret</dt>
          <dd className={health.webhookSecretConfigured ? 'ok' : 'bad'}>
            {health.webhookSecretConfigured ? 'configured' : 'missing'}
          </dd>
        </div>
        <div>
          <dt>Last event</dt>
          <dd className={staleEvents ? 'bad' : undefined}>
            {relative(health.lastEventAt)}
            {health.lastEventType ? ` · ${health.lastEventType}` : ''}
          </dd>
        </div>
        <div>
          <dt>Pending deliveries</dt>
          <dd className={health.pendingWebhookEvents > 0 ? 'bad' : 'ok'}>
            {health.pendingWebhookEvents}
          </dd>
        </div>
      </dl>

      {staleEvents && (
        <Banner type="error">
          No Stripe events received in over a week. If the shop is taking orders, the webhook is
          probably not reaching this deployment — orders will not be marked paid.
        </Banner>
      )}

      {health.webhookEndpoints.length > 0 && (
        <div className={`${baseClass}__endpoints`}>
          <h4>Webhook endpoints</h4>
          <ul>
            {health.webhookEndpoints.map((e) => (
              <li key={e.id}>
                <code>{e.url}</code>{' '}
                <span className={e.status === 'enabled' ? 'ok' : 'bad'}>{e.status}</span>{' '}
                <span className="muted">· {e.enabledEvents} events</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
