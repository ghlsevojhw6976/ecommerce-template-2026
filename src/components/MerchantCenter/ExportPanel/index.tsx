'use client'

import { Banner, Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

/**
 * Settings → Google Merchant Center → Export.
 *
 * Both channels, both delivery modes, one panel: live scheduled-fetch URLs
 * (Google Merchant Center and Meta Commerce Manager each poll their URL
 * daily) and one-click file downloads for manual uploads. Everything
 * renders from the same mapper, so what you download is byte-identical to
 * what the platforms fetch.
 */

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  border: '1px solid var(--theme-elevation-150)',
  padding: '14px 16px',
}

const URL_STYLE: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '12px',
  wordBreak: 'break-all',
  background: 'var(--theme-elevation-50)',
  padding: '6px 8px',
}

export const ExportPanel: React.FC = () => {
  const [token, setToken] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
    void fetch('/api/globals/merchant-center?depth=0', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => setToken(doc?.feedToken ?? null))
      .catch(() => {})
  }, [])

  const copy = useCallback((label: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    })
  }, [])

  if (!token) {
    return (
      <Banner type="info">
        Save this page once to generate the feed token, then the export links appear here.
      </Banner>
    )
  }

  const feeds = [
    {
      label: 'Google Shopping (RSS XML)',
      url: `${origin}/feed/google-shopping.xml?key=${token}`,
      download: `/feed/google-shopping.xml?key=${token}&download=1`,
      hint: 'Merchant Center → Data sources → Add product source → Scheduled fetch. Google downloads it daily — no API credentials needed.',
    },
    {
      label: 'Facebook / Meta catalog (CSV)',
      url: `${origin}/feed/facebook-catalog.csv?key=${token}`,
      download: `/feed/facebook-catalog.csv?key=${token}&download=1`,
      hint: 'Meta Commerce Manager → Catalog → Data sources → Data feed → Scheduled feed, or upload the downloaded file manually.',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: 'var(--base)' }}>
      {feeds.map((feed) => (
        <div key={feed.label} style={ROW_STYLE}>
          <strong style={{ fontSize: '14px' }}>{feed.label}</strong>
          <span style={{ fontSize: '13px', opacity: 0.75 }}>{feed.hint}</span>
          <code style={URL_STYLE}>{feed.url}</code>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <Button
              buttonStyle="secondary"
              onClick={() => copy(feed.label, feed.url)}
              size="small"
            >
              {copied === feed.label ? 'Copied!' : 'Copy URL'}
            </Button>
            <Button buttonStyle="secondary" el="anchor" size="small" url={feed.download}>
              Download file
            </Button>
          </div>
        </div>
      ))}
      <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
        Both feeds render from the same mapper as the preview — affiliate products and
        unpublished drafts are excluded everywhere. The token in the URL is the access key;
        treat the URLs as secrets.
      </p>
    </div>
  )
}
