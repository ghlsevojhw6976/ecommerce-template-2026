import type { Payload } from 'payload'

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import sanitizeHtml from 'sanitize-html'

import { ensureEmailCredentialsLoaded, resolveImapConfig, resolveSentFolder } from './keys'

/**
 * Live IMAP reads for the admin Mail view. Deliberately NO mailbox mirror in
 * Postgres: at 20–30 messages/day the mailbox itself is the source of truth,
 * a per-request connection is fast enough, and nothing can drift.
 *
 * Every connection is opened, used and logged out inside one call — IMAP
 * servers drop idle connections and pooled sockets across serverless
 * invocations are a liability, not an optimisation.
 */

export type MailboxMessage = {
  uid: number
  subject: string
  from: { name: string; address: string } | null
  to: string[]
  date: string | null
  seen: boolean
  messageId: string | null
}

export type MailboxMessageDetail = MailboxMessage & {
  /** Sanitized — safe to render inside the authenticated admin. */
  html: string | null
  text: string | null
  references: string | null
  attachments: { filename: string; size: number; contentType: string }[]
}

const withClient = async <T>(
  payload: Payload,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> => {
  await ensureEmailCredentialsLoaded(payload)
  const imap = resolveImapConfig()
  if (!imap) throw new Error('IMAP is not configured (Settings → Email).')

  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: true,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
    // ImapFlow's socketTimeout default is FIVE MINUTES; the admin Mail view
    // must fail in seconds, not hang a request that long.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.logout().catch(() => {})
  }
}

export const FOLDERS = { inbox: 'INBOX', sent: 'SENT' } as const
export type FolderKey = keyof typeof FOLDERS

const resolveFolder = (folder: FolderKey): string =>
  folder === 'sent' ? resolveSentFolder() : 'INBOX'

export type MailboxPage = {
  messages: MailboxMessage[]
  total: number
  page: number
  totalPages: number
}

const toListed = (message: {
  uid: number
  envelope?: {
    subject?: string
    from?: { name?: string; address?: string }[]
    to?: { address?: string }[]
    date?: Date
    messageId?: string
  }
  flags?: Set<string>
}): MailboxMessage => {
  const envelope = message.envelope
  const sender = envelope?.from?.[0]
  return {
    uid: message.uid,
    subject: envelope?.subject || '(no subject)',
    from: sender ? { name: sender.name || '', address: sender.address || '' } : null,
    to: (envelope?.to ?? []).map((addr) => addr.address || '').filter(Boolean),
    date: envelope?.date ? new Date(envelope.date).toISOString() : null,
    seen: message.flags?.has('\\Seen') ?? false,
    messageId: envelope?.messageId || null,
  }
}

export const listMessages = async (
  payload: Payload,
  {
    folder = 'inbox',
    page = 1,
    perPage = 25,
    q,
  }: { folder?: FolderKey; page?: number; perPage?: number; q?: string },
): Promise<MailboxPage> =>
  withClient(payload, async (client) => {
    const lock = await client.getMailboxLock(resolveFolder(folder))
    try {
      const query = q?.trim()

      // ---- Search: the IMAP server does the matching (SEARCH command) ----
      if (query) {
        const uids = ((await client.search(
          { or: [{ subject: query }, { from: query }, { body: query }] },
          { uid: true },
        )) || []) as number[]

        const total = uids.length
        const totalPages = Math.max(1, Math.ceil(total / perPage))
        const pageUids = uids
          .sort((a, b) => b - a) // newest first (UIDs ascend with arrival)
          .slice((page - 1) * perPage, page * perPage)

        const messages: MailboxMessage[] = []
        if (pageUids.length) {
          for await (const message of client.fetch(
            pageUids.join(','),
            { uid: true, envelope: true, flags: true },
            { uid: true },
          )) {
            messages.push(toListed(message))
          }
        }
        messages.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        return { messages, total, page, totalPages }
      }

      // ---- Plain listing: newest page by sequence range -------------------
      const mailbox = client.mailbox
      const total = mailbox && typeof mailbox === 'object' ? mailbox.exists : 0
      const totalPages = Math.max(1, Math.ceil(total / perPage))
      if (!total || page > totalPages) return { messages: [], total, page, totalPages }

      const end = total - (page - 1) * perPage
      const start = Math.max(1, end - perPage + 1)

      const messages: MailboxMessage[] = []
      for await (const message of client.fetch(`${start}:${end}`, {
        uid: true,
        envelope: true,
        flags: true,
      })) {
        messages.push(toListed(message))
      }

      return { messages: messages.reverse(), total, page, totalPages }
    } finally {
      lock.release()
    }
  })

/**
 * Unread count for the nav badge — IMAP STATUS, which the server answers
 * from its index without opening the mailbox. Null when IMAP is not
 * configured or unreachable: a badge must degrade to absent, never block
 * the admin shell.
 */
export const inboxUnseen = async (payload: Payload): Promise<number | null> => {
  try {
    return await withClient(payload, async (client) => {
      const status = await client.status('INBOX', { unseen: true })
      return typeof status.unseen === 'number' ? status.unseen : null
    })
  } catch {
    return null
  }
}

export const getMessage = async (
  payload: Payload,
  { folder = 'inbox', uid }: { folder?: FolderKey; uid: number },
): Promise<MailboxMessageDetail | null> =>
  withClient(payload, async (client) => {
    const lock = await client.getMailboxLock(resolveFolder(folder))
    try {
      const message = await client.fetchOne(
        String(uid),
        { uid: true, envelope: true, flags: true, source: true },
        { uid: true },
      )
      if (!message || !message.source) return null

      const parsed = await simpleParser(message.source)

      // Inbound HTML rendered inside the authenticated admin is an XSS
      // vector — sanitize hard: no scripts, no styles-with-url, no forms.
      const safeHtml = parsed.html
        ? sanitizeHtml(parsed.html, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'span']),
            allowedAttributes: {
              ...sanitizeHtml.defaults.allowedAttributes,
              '*': ['style'],
              img: ['src', 'alt', 'width', 'height'],
              a: ['href', 'name', 'target', 'rel'],
            },
            // Remote images allowed (they render the mail correctly); tracking
            // pixels are the trade-off — acceptable inside an admin tool.
            allowedSchemes: ['http', 'https', 'mailto', 'cid', 'data'],
          })
        : null

      const envelope = message.envelope
      const sender = envelope?.from?.[0]

      // Opening a message marks it read, like any mail client.
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {})

      return {
        uid: message.uid,
        subject: envelope?.subject || '(no subject)',
        from: sender ? { name: sender.name || '', address: sender.address || '' } : null,
        to: (envelope?.to ?? []).map((addr) => addr.address || '').filter(Boolean),
        date: envelope?.date ? new Date(envelope.date).toISOString() : null,
        seen: true,
        messageId: envelope?.messageId || null,
        references: parsed.references
          ? Array.isArray(parsed.references)
            ? parsed.references.join(' ')
            : parsed.references
          : null,
        html: safeHtml,
        text: parsed.text || null,
        attachments: (parsed.attachments ?? []).map((attachment) => ({
          filename: attachment.filename || 'attachment',
          size: attachment.size,
          contentType: attachment.contentType,
        })),
      }
    } finally {
      lock.release()
    }
  })
