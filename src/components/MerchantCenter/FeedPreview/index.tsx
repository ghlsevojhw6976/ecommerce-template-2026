'use client'

import { Banner, Button } from '@payloadcms/ui'
import React, { useCallback, useState } from 'react'

import './index.scss'

const baseClass = 'merchant-feed-preview'

type Report = {
  market: { feedLabel: string; contentLanguage: string; currencyCode: string }
  counts: { total: number; included: number; skipped: number }
  skippedByReason: Record<string, number>
  /** Included but imperfect — sale-annotation and stale-sale warnings. */
  warnings?: { offerId: string; warnings: string[] }[]
  sample: unknown
}

/**
 * Dry-run preview: asks the server what WOULD be sent to Google and shows the
 * answer, including why products were withheld.
 *
 * Runs entirely without Google credentials — the point is to make the feed
 * reviewable before anything is ever pushed.
 */
export const FeedPreview: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/next/merchant/preview', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        setError(`Preview failed (${res.status}). ${await res.text()}`)
        return
      }
      setReport((await res.json()) as Report)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className={baseClass}>
      <div className={`${baseClass}__header`}>
        <Button buttonStyle="secondary" disabled={loading} onClick={run} size="small">
          {loading ? 'Building…' : 'Preview feed'}
        </Button>
        <span className={`${baseClass}__hint`}>
          Builds the payload locally. Sends nothing to Google.
        </span>
      </div>

      {error && (
        <Banner type="error">
          <strong>Preview failed.</strong> {error}
        </Banner>
      )}

      {report && (
        <div className={`${baseClass}__results`}>
          <div className={`${baseClass}__stats`}>
            <div className={`${baseClass}__stat`}>
              <span className={`${baseClass}__stat-value`}>{report.counts.included}</span>
              <span className={`${baseClass}__stat-label`}>would be sent</span>
            </div>
            <div className={`${baseClass}__stat`}>
              <span className={`${baseClass}__stat-value`}>{report.counts.skipped}</span>
              <span className={`${baseClass}__stat-label`}>withheld</span>
            </div>
            <div className={`${baseClass}__stat`}>
              <span className={`${baseClass}__stat-value`}>{report.counts.total}</span>
              <span className={`${baseClass}__stat-label`}>products total</span>
            </div>
          </div>

          <p className={`${baseClass}__market`}>
            Market: <code>{report.market.contentLanguage}</code> /{' '}
            <code>{report.market.feedLabel}</code> / <code>{report.market.currencyCode}</code>
          </p>

          {Object.keys(report.skippedByReason).length > 0 && (
            <div className={`${baseClass}__reasons`}>
              <h4>Why products were withheld</h4>
              <ul>
                {Object.entries(report.skippedByReason).map(([reason, count]) => (
                  <li key={reason}>
                    <strong>{count}</strong> — {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(report.warnings?.length ?? 0) > 0 && (
            <div className={`${baseClass}__reasons`}>
              <h4>Sale-price warnings (sent, but check these)</h4>
              <ul>
                {report.warnings!.map((entry) => (
                  <li key={entry.offerId}>
                    <strong>{entry.offerId}</strong>
                    <ul>
                      {entry.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.counts.included > 0 && (
            <details className={`${baseClass}__sample`}>
              <summary>Sample payload (first product)</summary>
              <pre>{JSON.stringify(report.sample, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
