'use client'

import { Banner, Button, toast } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import './index.scss'

const baseClass = 'stripe-webhook-setup'

type Health = {
  webhookUrl: string
  webhookUrlIsLocal: boolean
  webhookSecretConfigured: boolean
  handledEvents: string[]
  recommendedEvents: { event: string; why: string; critical: boolean }[]
  unhandledCriticalEvents: string[]
  matchingEndpointFound: boolean
  webhookEndpoints: { id: string; url: string; status: string; enabledEvents: number }[]
}

const Copy: React.FC<{ value: string; label?: string }> = ({ value, label = 'Copy' }) => (
  <button
    className={`${baseClass}__copy`}
    onClick={async () => {
      try {
        await navigator.clipboard.writeText(value)
        toast.success('Copied to clipboard.')
      } catch {
        toast.error('Could not copy — select the text manually.')
      }
    }}
    type="button"
  >
    {label}
  </button>
)

export const WebhookSetup: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/next/stripe/health', { credentials: 'include' })
        if (res.ok) setHealth((await res.json()) as Health)
      } catch {
        /* the connection panel above already reports failures */
      }
    })()
  }, [])

  const cliCommand = 'pnpm stripe-webhooks'

  const eventList = useCallback(
    () => (health?.recommendedEvents ?? []).map((e) => e.event).join(' '),
    [health],
  )

  if (!health) return null

  return (
    <div className={baseClass}>
      <h3>Webhook endpoint</h3>

      <p className={`${baseClass}__hint`}>
        Stripe calls this URL when something happens to a payment. Without it, the shop only learns
        about a payment while the customer’s browser is still open.
      </p>

      {/* ---- The URL ---- */}
      <div className={`${baseClass}__url-row`}>
        <code className={`${baseClass}__url`}>{health.webhookUrl}</code>
        <Copy value={health.webhookUrl} />
      </div>

      {health.webhookUrlIsLocal ? (
        <Banner type="info">
          This is a local URL — Stripe cannot reach it from the internet. For local development use
          the Stripe CLI instead (below). Set <code>NEXT_PUBLIC_SERVER_URL</code> to the deployed
          domain and this URL updates automatically.
        </Banner>
      ) : health.matchingEndpointFound ? (
        <Banner type="success">
          An endpoint with this exact URL already exists in your Stripe account.
        </Banner>
      ) : (
        <Banner type="info">
          No endpoint with this URL found in Stripe yet — follow the steps below.
        </Banner>
      )}

      {/* ---- The gap that actually matters ---- */}
      {health.unhandledCriticalEvents.length > 0 && (
        <Banner type="error">
          <strong>Registering the endpoint alone will not do anything yet.</strong> The adapter only
          reacts to events that have a handler in{' '}
          <code>src/lib/stripe/webhookHandlers.ts</code>, and these have none:{' '}
          <code>{health.unhandledCriticalEvents.join(', ')}</code>. Events arrive, get a 200, and are
          discarded. Until a handler exists, use the reconciliation panel above to catch missed
          payments.
        </Banner>
      )}

      {/* ---- Dashboard steps ---- */}
      <ol className={`${baseClass}__steps`}>
        <li>
          Open{' '}
          <a href="https://dashboard.stripe.com/webhooks" rel="noopener noreferrer" target="_blank">
            Stripe Dashboard → Developers → Webhooks
          </a>{' '}
          and click <strong>Add endpoint</strong>. Check the test/live toggle matches the key this
          deployment uses.
        </li>
        <li>
          Paste the endpoint URL above into <strong>Endpoint URL</strong>.
        </li>
        <li>
          Select these events: <Copy label="Copy event list" value={eventList()} />
          <ul className={`${baseClass}__events`}>
            {health.recommendedEvents.map((e) => {
              const handled = health.handledEvents.includes(e.event)
              return (
                <li key={e.event}>
                  <code>{e.event}</code>
                  {e.critical && <span className="tag tag--critical">critical</span>}
                  <span className={`tag ${handled ? 'tag--ok' : 'tag--todo'}`}>
                    {handled ? 'handled' : 'no handler yet'}
                  </span>
                  <div className={`${baseClass}__why`}>{e.why}</div>
                </li>
              )
            })}
          </ul>
        </li>
        <li>
          Save, then reveal the <strong>Signing secret</strong> (<code>whsec_…</code>) and set it as{' '}
          <code>STRIPE_WEBHOOKS_SIGNING_SECRET</code> in this environment.{' '}
          {health.webhookSecretConfigured ? (
            <span className="tag tag--ok">currently set</span>
          ) : (
            <span className="tag tag--todo">not set</span>
          )}
          <div className={`${baseClass}__why`}>
            Without it the adapter cannot verify signatures and rejects every event. The secret is
            per-endpoint — test and live have different ones.
          </div>
        </li>
        <li>
          Redeploy so the new env var is picked up, then use <strong>Send test webhook</strong> in
          Stripe and confirm “Last event” in the panel above updates.
        </li>
      </ol>

      {/* ---- Local dev ---- */}
      <div className={`${baseClass}__local`}>
        <h4>Local development</h4>
        <p className={`${baseClass}__hint`}>
          Stripe cannot reach localhost, so forward events with the Stripe CLI instead of creating a
          dashboard endpoint:
        </p>
        <div className={`${baseClass}__url-row`}>
          <code className={`${baseClass}__url`}>{cliCommand}</code>
          <Copy value={cliCommand} />
        </div>
        <p className={`${baseClass}__why`}>
          The CLI prints its own <code>whsec_…</code> on startup — use that one locally. It differs
          from the dashboard endpoint’s secret and changes each time you restart it.
        </p>
      </div>

      {/* ---- Existing endpoints ---- */}
      {health.webhookEndpoints.length > 0 && (
        <div className={`${baseClass}__existing`}>
          <h4>Endpoints registered in Stripe</h4>
          <ul>
            {health.webhookEndpoints.map((e) => (
              <li key={e.id}>
                <code>{e.url}</code>{' '}
                <span className={e.status === 'enabled' ? 'tag tag--ok' : 'tag tag--todo'}>
                  {e.status}
                </span>{' '}
                <span className={`${baseClass}__why`}>· {e.enabledEvents} events</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
