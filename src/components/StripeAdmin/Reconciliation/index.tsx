'use client'

import { Banner, Button, toast } from '@payloadcms/ui'
import React, { useCallback, useState } from 'react'

import './index.scss'

const baseClass = 'stripe-reconciliation'

type Drift = {
  transactionId: number
  paymentIntentId: string
  localStatus: string
  stripeStatus: string
  localAmount: number
  stripeAmount: number
  issue: string
  repairable: boolean
}

type Report = {
  checkedAt: string
  checked: number
  matched: number
  drift: Drift[]
  skippedNoPaymentIntent: number
  error?: string
}

export const Reconciliation: React.FC = () => {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [repairing, setRepairing] = useState<number | null>(null)

  const run = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/next/stripe/reconcile', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        toast.error(`Reconcile failed: ${await res.text()}`)
        return
      }
      setReport((await res.json()) as Report)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reconcile failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  const repair = useCallback(
    async (transactionId: number) => {
      setRepairing(transactionId)
      try {
        const res = await fetch('/next/stripe/actions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync', transactionId }),
        })
        const result = (await res.json()) as { ok: boolean; message: string }
        if (result.ok) {
          toast.success(result.message)
          await run()
        } else {
          toast.error(result.message)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Sync failed.')
      } finally {
        setRepairing(null)
      }
    },
    [run],
  )

  return (
    <div className={baseClass}>
      <div className={`${baseClass}__head`}>
        <h3>Reconciliation</h3>
        <Button buttonStyle="secondary" disabled={loading} onClick={run} size="small">
          {loading ? 'Checking…' : 'Check against Stripe'}
        </Button>
      </div>

      <p className={`${baseClass}__hint`}>
        Compares recent transactions with Stripe. Stripe is the source of truth for whether money
        moved — where they disagree, it usually means a webhook was missed.
      </p>

      {report?.error && <Banner type="error">{report.error}</Banner>}

      {report && !report.error && (
        <>
          <div className={`${baseClass}__stats`}>
            <div>
              <span className={`${baseClass}__value`}>{report.checked}</span>
              <span className={`${baseClass}__label`}>checked</span>
            </div>
            <div>
              <span className={`${baseClass}__value ok`}>{report.matched}</span>
              <span className={`${baseClass}__label`}>in sync</span>
            </div>
            <div>
              <span
                className={`${baseClass}__value ${report.drift.length ? 'bad' : 'ok'}`}
              >
                {report.drift.length}
              </span>
              <span className={`${baseClass}__label`}>drifted</span>
            </div>
          </div>

          {report.drift.length === 0 ? (
            <Banner type="success">
              Everything matches Stripe.
              {report.skippedNoPaymentIntent > 0 &&
                ` (${report.skippedNoPaymentIntent} transactions had no payment intent and were skipped.)`}
            </Banner>
          ) : (
            <table className={`${baseClass}__table`}>
              <thead>
                <tr>
                  <th>Txn</th>
                  <th>Local</th>
                  <th>Stripe</th>
                  <th>Issue</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.drift.map((d) => (
                  <tr key={d.transactionId}>
                    <td>
                      <a href={`/admin/collections/transactions/${d.transactionId}`}>
                        #{d.transactionId}
                      </a>
                    </td>
                    <td>{d.localStatus}</td>
                    <td>{d.stripeStatus}</td>
                    <td>
                      {d.issue}
                      {d.issue === 'amount-mismatch' && (
                        <div className={`${baseClass}__amounts`}>
                          {d.localAmount} vs {d.stripeAmount}
                        </div>
                      )}
                    </td>
                    <td>
                      {d.repairable ? (
                        <Button
                          buttonStyle="secondary"
                          disabled={repairing === d.transactionId}
                          onClick={() => repair(d.transactionId)}
                          size="small"
                        >
                          {repairing === d.transactionId ? 'Syncing…' : 'Sync from Stripe'}
                        </Button>
                      ) : (
                        <span className="muted">needs review</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
