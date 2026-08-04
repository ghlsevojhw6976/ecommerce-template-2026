'use client'

import { Banner, Button, useDocumentInfo, toast } from '@payloadcms/ui'
import React, { useCallback, useState } from 'react'

import './index.scss'

const baseClass = 'stripe-refund'

/**
 * Refund action on a transaction.
 *
 * Two-step by design: the button only arms the form, and the confirm button
 * carries the amount. Refunds are irreversible, so a single misplaced click
 * must not be able to move money.
 */
export const RefundPanel: React.FC = () => {
  const { id, savedDocumentData } = useDocumentInfo()

  const [armed, setArmed] = useState(false)
  const [partial, setPartial] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const status = String((savedDocumentData as Record<string, any>)?.status ?? '')
  const charged = Number((savedDocumentData as Record<string, any>)?.amount ?? 0)
  const paymentIntentId = (savedDocumentData as Record<string, any>)?.stripe?.paymentIntentID

  const submit = useCallback(async () => {
    setBusy(true)
    try {
      const body: Record<string, unknown> = { action: 'refund', transactionId: id }
      if (partial) {
        const parsed = Number(amount)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          toast.error('Enter a refund amount in cents.')
          setBusy(false)
          return
        }
        body.amount = Math.round(parsed)
      }

      const res = await fetch('/next/stripe/actions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = (await res.json()) as { ok: boolean; message: string }

      if (result.ok) {
        toast.success(result.message)
        setDone(result.message)
        setArmed(false)
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Refund failed.')
    } finally {
      setBusy(false)
    }
  }, [amount, id, partial])

  if (!id) return null

  if (!paymentIntentId) {
    return (
      <div className={baseClass}>
        <p className={`${baseClass}__muted`}>No Stripe payment intent on this transaction.</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className={baseClass}>
        <Banner type="success">{done}</Banner>
        <p className={`${baseClass}__muted`}>Reload to see the updated status.</p>
      </div>
    )
  }

  if (status === 'refunded') {
    return (
      <div className={baseClass}>
        <Banner type="info">This transaction is already refunded.</Banner>
      </div>
    )
  }

  if (status !== 'succeeded') {
    return (
      <div className={baseClass}>
        <p className={`${baseClass}__muted`}>
          Only succeeded transactions can be refunded — this one is “{status || 'unknown'}”.
        </p>
      </div>
    )
  }

  return (
    <div className={baseClass}>
      {!armed ? (
        <Button buttonStyle="secondary" onClick={() => setArmed(true)} size="small">
          Refund…
        </Button>
      ) : (
        <div className={`${baseClass}__confirm`}>
          <Banner type="error">
            Refunds are irreversible and move real money if this account is in live mode.
          </Banner>

          <label className={`${baseClass}__choice`}>
            <input checked={!partial} onChange={() => setPartial(false)} type="radio" />
            Full refund ({charged} minor units)
          </label>
          <label className={`${baseClass}__choice`}>
            <input checked={partial} onChange={() => setPartial(true)} type="radio" />
            Partial
          </label>

          {partial && (
            <input
              className={`${baseClass}__amount`}
              inputMode="numeric"
              max={charged}
              min={1}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount in cents (max ${charged})`}
              type="number"
              value={amount}
            />
          )}

          <div className={`${baseClass}__actions`}>
            <Button buttonStyle="primary" disabled={busy} onClick={submit} size="small">
              {busy ? 'Refunding…' : 'Confirm refund'}
            </Button>
            <Button
              buttonStyle="secondary"
              disabled={busy}
              onClick={() => setArmed(false)}
              size="small"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
