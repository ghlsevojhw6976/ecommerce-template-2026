'use client'

import { Banner, Button, useField, useFormFields } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import './index.scss'

const baseClass = 'palette-preview'

type Check = {
  pairing: string
  ratio: number
  required: number
  passes: boolean
  adjusted: boolean
  informational?: boolean
}

type Preview = {
  ok: boolean
  message?: string
  source?: string[]
  roles?: Record<string, string>
  checks?: Check[]
  accessible?: boolean
}

const ROLE_ORDER: [string, string][] = [
  ['surface', 'Surface'],
  ['ink', 'Ink'],
  ['primary', 'Primary'],
  ['accent', 'Accent'],
  ['support', 'Support'],
  ['muted', 'Muted'],
  ['border', 'Border'],
]

/**
 * Live palette preview with a full contrast report.
 *
 * The reporting is the point. The engine will silently correct an unreadable
 * palette, and an admin who pastes a colour and gets a different one back
 * deserves to be told — "your accent was darkened to pass on buttons" rather
 * than a mysterious mismatch with the swatch they chose.
 */
export const PalettePreview: React.FC = () => {
  const paletteField = useFormFields(([fields]) => fields?.palette)
  const { value } = useField<string>({ path: 'palette' })

  const raw = (value ?? (paletteField?.value as string) ?? '').toString()

  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (palette: string) => {
    if (!palette.trim()) {
      setPreview(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/next/theme/preview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ palette }),
      })
      setPreview(res.ok ? ((await res.json()) as Preview) : null)
    } catch {
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced so typing a URL does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(raw), 350)
    return () => clearTimeout(timer)
  }, [raw, load])

  if (!raw.trim()) {
    return (
      <div className={baseClass}>
        <p className={`${baseClass}__hint`}>
          Paste a palette above to preview it. Any palette from{' '}
          <a href="https://coolors.co/palettes/trending" rel="noopener noreferrer" target="_blank">
            coolors.co/palettes/trending
          </a>{' '}
          will work — roles are assigned by lightness and chroma, not by the order of the swatches.
        </p>
      </div>
    )
  }

  if (loading && !preview) return <p className={`${baseClass}__hint`}>Resolving…</p>
  if (!preview) return null

  if (!preview.ok) {
    return <Banner type="error">{preview.message}</Banner>
  }

  const gated = (preview.checks ?? []).filter((c) => !c.informational)
  const adjusted = gated.filter((c) => c.adjusted)

  return (
    <div className={baseClass}>
      {/* ---- Source swatches ---- */}
      <div className={`${baseClass}__section`}>
        <h4>Palette read</h4>
        <div className={`${baseClass}__swatches`}>
          {(preview.source ?? []).map((hex) => (
            <div className={`${baseClass}__swatch`} key={hex}>
              <span style={{ background: hex }} />
              <code>{hex}</code>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Assigned roles ---- */}
      <div className={`${baseClass}__section`}>
        <h4>Assigned roles</h4>
        <div className={`${baseClass}__swatches`}>
          {ROLE_ORDER.map(([key, label]) => {
            const hex = preview.roles?.[key]
            if (!hex) return null
            return (
              <div className={`${baseClass}__swatch`} key={key}>
                <span style={{ background: hex }} />
                <strong>{label}</strong>
                <code>{hex}</code>
              </div>
            )
          })}
        </div>
      </div>

      {/* ---- Rendered sample ---- */}
      <div className={`${baseClass}__section`}>
        <h4>How it reads</h4>
        <div
          className={`${baseClass}__sample`}
          style={{
            background: preview.roles?.surface,
            borderColor: preview.roles?.border,
            color: preview.roles?.ink,
          }}
        >
          <p className={`${baseClass}__sample-title`}>Tri-Ply Copper Sauté Pan</p>
          <p style={{ color: preview.roles?.mutedForeground }}>
            Hand-finished copper over an aluminium core.
          </p>
          <div className={`${baseClass}__sample-actions`}>
            <span
              style={{ background: preview.roles?.primary, color: preview.roles?.onPrimary }}
            >
              Add to cart
            </span>
            <span style={{ background: preview.roles?.accent, color: preview.roles?.onAccent }}>
              Sale
            </span>
          </div>
        </div>
      </div>

      {/* ---- Contrast report ---- */}
      <div className={`${baseClass}__section`}>
        <h4>Contrast</h4>

        {preview.accessible ? (
          <Banner type="success">All text and control pairings meet WCAG AA.</Banner>
        ) : (
          <Banner type="error">
            Some pairings could not reach AA even after adjustment. This palette may not be usable
            as-is.
          </Banner>
        )}

        {adjusted.length > 0 && (
          <p className={`${baseClass}__hint`}>
            {adjusted.length} colour{adjusted.length > 1 ? 's were' : ' was'} adjusted to stay
            readable — the swatch you picked is not always the swatch that ships.
          </p>
        )}

        <ul className={`${baseClass}__checks`}>
          {(preview.checks ?? []).map((check) => (
            <li key={check.pairing}>
              <span className={`${baseClass}__check-label`}>{check.pairing}</span>
              <span className={`${baseClass}__check-ratio`}>
                {check.ratio}:1
                <em> / {check.required}:1</em>
              </span>
              <span
                className={`tag ${
                  check.informational ? 'tag--info' : check.passes ? 'tag--ok' : 'tag--fail'
                }`}
              >
                {check.informational ? 'decorative' : check.passes ? 'pass' : 'fail'}
              </span>
              {check.adjusted && <span className="tag tag--adj">adjusted</span>}
            </li>
          ))}
        </ul>
      </div>

      <Button buttonStyle="secondary" onClick={() => void load(raw)} size="small">
        Re-check
      </Button>
    </div>
  )
}
