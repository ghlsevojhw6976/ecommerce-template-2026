'use client'

import { Banner, Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

/**
 * The inbox UI: folder tabs, message list, reading pane, inline reply.
 *
 * Reads the live mailbox through /next/mail on every refresh — no local
 * mirror, so what you see is exactly what any mail client would show.
 * Message HTML arrives already sanitized server-side and is additionally
 * rendered inside a sandboxed iframe: two independent layers between
 * inbound mail and the authenticated admin session.
 */

type ListedMessage = {
  uid: number
  subject: string
  from: { name: string; address: string } | null
  date: string | null
  seen: boolean
}

type MessageDetail = ListedMessage & {
  to: string[]
  html: string | null
  text: string | null
  messageId: string | null
  references: string | null
  attachments: { filename: string; size: number; contentType: string }[]
}

type OrderRef = { id: number | string; createdAt: string }

const timeLabel = (iso: string | null): string => {
  if (!iso) return ''
  const date = new Date(iso)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const MailClient: React.FC = () => {
  const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox')
  const [messages, setMessages] = useState<ListedMessage[] | null>(null)
  const [configured, setConfigured] = useState(true)
  const [selected, setSelected] = useState<MessageDetail | null>(null)
  const [orders, setOrders] = useState<OrderRef[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')

  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentNote, setSentNote] = useState<string | null>(null)

  const loadList = useCallback(
    async (target: 'inbox' | 'sent', targetPage: number, q: string) => {
      setLoading(true)
      setError(null)
      setSelected(null)
      try {
        const params = new URLSearchParams({ action: 'list', folder: target })
        if (targetPage > 1) params.set('page', String(targetPage))
        if (q) params.set('q', q)
        const res = await fetch(`/next/mail?${params}`, { credentials: 'include' })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        if (data.configured === false) {
          setConfigured(false)
          setMessages([])
          return
        }
        setConfigured(true)
        setMessages(data.messages as ListedMessage[])
        setTotal(data.total ?? 0)
        setTotalPages(data.totalPages ?? 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the mailbox.')
        setMessages([])
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadList(folder, page, activeQuery)
  }, [folder, page, activeQuery, loadList])

  const runSearch = useCallback(() => {
    setPage(1)
    setActiveQuery(searchInput.trim())
  }, [searchInput])

  const switchFolder = useCallback((target: 'inbox' | 'sent') => {
    setFolder(target)
    setPage(1)
  }, [])

  const openMessage = useCallback(
    async (uid: number) => {
      setLoading(true)
      setError(null)
      setSentNote(null)
      setReplyBody('')
      try {
        const res = await fetch(`/next/mail?action=message&folder=${folder}&uid=${uid}`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        setSelected(data.message as MessageDetail)
        setOrders((data.orders ?? []) as OrderRef[])
        setMessages(
          (existing) =>
            existing?.map((message) =>
              message.uid === uid ? { ...message, seen: true } : message,
            ) ?? existing,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open the message.')
      } finally {
        setLoading(false)
      }
    },
    [folder],
  )

  const sendReply = useCallback(async () => {
    if (!selected?.from?.address || !replyBody.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/next/mail', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selected.from.address,
          subject: selected.subject.startsWith('Re:')
            ? selected.subject
            : `Re: ${selected.subject}`,
          body: replyBody.trim(),
          inReplyTo: selected.messageId ?? undefined,
          references: [selected.references, selected.messageId].filter(Boolean).join(' '),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSentNote(`Reply sent to ${selected.from.address}.`)
      setReplyBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The reply could not be sent.')
    } finally {
      setSending(false)
    }
  }, [selected, replyBody])

  if (!configured) {
    return (
      <div style={{ paddingTop: '1.5rem' }}>
        <h1 style={{ marginBottom: '1rem' }}>Mail</h1>
        <Banner type="info">
          The mailbox is not configured yet — add IMAP credentials under{' '}
          <a href="/admin/globals/email-settings">Settings → Email</a>.
        </Banner>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        <h1 style={{ margin: 0 }}>Mail</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button
            buttonStyle={folder === 'inbox' ? 'primary' : 'secondary'}
            onClick={() => switchFolder('inbox')}
            size="small"
          >
            Inbox
          </Button>
          <Button
            buttonStyle={folder === 'sent' ? 'primary' : 'secondary'}
            onClick={() => switchFolder('sent')}
            size="small"
          >
            Sent
          </Button>
          <Button
            buttonStyle="secondary"
            onClick={() => void loadList(folder, page, activeQuery)}
            size="small"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Search runs on the SERVER (IMAP SEARCH over from/subject/body) —
          it covers the whole mailbox, not just the loaded page. */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', maxWidth: '480px' }}>
        <input
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') runSearch()
          }}
          placeholder="Search sender, subject or text…"
          style={{
            flex: 1,
            padding: '8px 10px',
            border: '1px solid var(--theme-elevation-250)',
            background: 'var(--theme-input-bg)',
            color: 'inherit',
            fontSize: '14px',
          }}
          value={searchInput}
        />
        <Button buttonStyle="secondary" onClick={runSearch} size="small">
          Search
        </Button>
        {activeQuery && (
          <Button
            buttonStyle="secondary"
            onClick={() => {
              setSearchInput('')
              setActiveQuery('')
              setPage(1)
            }}
            size="small"
          >
            Clear
          </Button>
        )}
      </div>
      {activeQuery && !loading && (
        <p style={{ margin: '0 0 0.75rem', fontSize: '13px', opacity: 0.8 }}>
          {total} result{total === 1 ? '' : 's'} for “{activeQuery}”
        </p>
      )}

      {error && (
        <Banner type="error">
          <strong>Mail error.</strong> {error}
        </Banner>
      )}
      {sentNote && <Banner type="success">{sentNote}</Banner>}

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.5rem' }}>
        {/* ---- Message list ---- */}
        <div style={{ borderRight: '1px solid var(--theme-elevation-150)', paddingRight: '1rem' }}>
          {loading && !messages && <p>Loading…</p>}
          {messages?.length === 0 && !loading && (
            <p>{activeQuery ? 'Nothing matches the search.' : 'No messages.'}</p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {messages?.map((message) => (
              <li key={message.uid}>
                <button
                  onClick={() => void openMessage(message.uid)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background:
                      selected?.uid === message.uid
                        ? 'var(--theme-elevation-100)'
                        : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--theme-elevation-100)',
                    padding: '10px 8px',
                    cursor: 'pointer',
                  }}
                  type="button"
                >
                  <span
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '8px',
                      fontWeight: message.seen ? 400 : 700,
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {message.from?.name || message.from?.address || 'Unknown sender'}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: '12px', opacity: 0.7 }}>
                      {timeLabel(message.date)}
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      opacity: 0.85,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: message.seen ? 400 : 600,
                    }}
                  >
                    {message.subject}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '0.75rem',
              }}
            >
              <Button
                buttonStyle="secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                size="small"
              >
                ← Newer
              </Button>
              <span style={{ fontSize: '12px', opacity: 0.7 }}>
                {page} / {totalPages}
              </span>
              <Button
                buttonStyle="secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                size="small"
              >
                Older →
              </Button>
            </div>
          )}
        </div>

        {/* ---- Reading pane ---- */}
        <div>
          {!selected && <p style={{ opacity: 0.7 }}>Select a message to read it.</p>}
          {selected && (
            <div>
              <h2 style={{ margin: '0 0 4px' }}>{selected.subject}</h2>
              <p style={{ margin: '0 0 4px', fontSize: '13px', opacity: 0.8 }}>
                From {selected.from?.name ? `${selected.from.name} — ` : ''}
                {selected.from?.address} · {timeLabel(selected.date)}
              </p>
              {orders.length > 0 && (
                <p style={{ margin: '0 0 12px', fontSize: '13px' }}>
                  Customer orders:{' '}
                  {orders.map((order, index) => (
                    <React.Fragment key={order.id}>
                      {index > 0 && ', '}
                      <a href={`/admin/collections/orders/${order.id}`}>#{order.id}</a>
                    </React.Fragment>
                  ))}
                </p>
              )}
              {selected.attachments.length > 0 && (
                <p style={{ margin: '0 0 12px', fontSize: '13px', opacity: 0.8 }}>
                  Attachments:{' '}
                  {selected.attachments
                    .map(
                      (attachment) =>
                        `${attachment.filename} (${Math.round(attachment.size / 1024)} KB)`,
                    )
                    .join(', ')}{' '}
                  — open the mailbox in a mail client to download.
                </p>
              )}

              {selected.html ? (
                <iframe
                  sandbox=""
                  srcDoc={selected.html}
                  style={{
                    width: '100%',
                    minHeight: '420px',
                    border: '1px solid var(--theme-elevation-150)',
                    background: '#fff',
                  }}
                  title="Message"
                />
              ) : (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    border: '1px solid var(--theme-elevation-150)',
                    padding: '1rem',
                  }}
                >
                  {selected.text || '(empty message)'}
                </pre>
              )}

              {/* ---- Reply ---- */}
              {selected.from?.address && (
                <div style={{ marginTop: '1.25rem' }}>
                  <textarea
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder={`Reply to ${selected.from.address}…`}
                    rows={5}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid var(--theme-elevation-250)',
                      background: 'var(--theme-input-bg)',
                      color: 'inherit',
                      fontFamily: 'inherit',
                      fontSize: '14px',
                    }}
                    value={replyBody}
                  />
                  <div style={{ marginTop: '0.5rem' }}>
                    <Button
                      buttonStyle="primary"
                      disabled={sending || !replyBody.trim()}
                      onClick={() => void sendReply()}
                      size="small"
                    >
                      {sending ? 'Sending…' : 'Send reply'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
