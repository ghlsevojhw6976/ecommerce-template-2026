import type { Payload } from 'payload'

import nodemailer from 'nodemailer'

import {
  emailIsConfigured,
  ensureEmailCredentialsLoaded,
  resolveFrom,
  resolveImapConfig,
  resolveReplyTo,
  resolveSentFolder,
  resolveSmtpConfig,
} from './keys'

/**
 * The one outbound path. Everything the shop sends — transactional emails,
 * admin replies, Payload auth emails — goes through sendShopEmail so the
 * rules hold everywhere:
 *
 * - Transport is built per send from the keystore (admin > env), so pasted
 *   credentials work without a restart. At ~20–30 emails/day, per-send
 *   connections are simpler and more robust than pooling.
 * - Every send is best-effort APPENDed to the IMAP Sent folder, so the
 *   mailbox (and the admin Mail view) shows the customer's full history —
 *   SMTP alone does not file a copy anywhere.
 * - Failures throw to the caller; callers on money paths catch and log,
 *   because an email failure must never fail an order.
 */

export type ShopEmailArgs = {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  inReplyTo?: string
  references?: string
  fromNameOverride?: string
}

export const sendShopEmail = async (
  payload: Payload,
  args: ShopEmailArgs,
): Promise<{ messageId: string }> => {
  await ensureEmailCredentialsLoaded(payload)

  const smtp = resolveSmtpConfig()
  if (!smtp) throw new Error('Email is not configured (Settings → Email).')

  const from = resolveFrom()
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    // A slow mail server must fail fast, never hang the caller — order saves
    // send synchronously in a hook, and nodemailer's defaults wait minutes.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  })

  const message = {
    from: from ? { name: from.name, address: from.address } : smtp.user,
    to: args.to,
    subject: args.subject,
    html: args.html,
    ...(args.text ? { text: args.text } : {}),
    // Explicit per-message replyTo wins; otherwise the configured shop-wide
    // Reply-To; otherwise no header (replies go to From — which must then be
    // the connected mailbox or customer replies vanish).
    ...(args.replyTo || resolveReplyTo()
      ? { replyTo: args.replyTo || resolveReplyTo() }
      : {}),
    ...(args.inReplyTo ? { inReplyTo: args.inReplyTo } : {}),
    ...(args.references ? { references: args.references } : {}),
  }

  const info = await transport.sendMail(message)

  // File a copy in Sent — best-effort: a filing failure must not turn a
  // delivered email into a reported error.
  try {
    await appendToSent(payload, message)
  } catch (error) {
    payload.logger.warn({ err: error }, 'Sent email could not be filed to the IMAP Sent folder')
  }

  return { messageId: info.messageId }
}

const appendToSent = async (
  payload: Payload,
  message: Record<string, unknown>,
): Promise<void> => {
  const imap = resolveImapConfig()
  if (!imap) return

  // Build the raw RFC822 message once, with nodemailer's stream transport.
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const composed = await composer.sendMail(message as never)
  const raw = composed.message as Buffer

  const { ImapFlow } = await import('imapflow')
  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: true,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
    // ImapFlow's socketTimeout DEFAULT IS FIVE MINUTES — a stalled server
    // hangs the caller for exactly that long. Fail in seconds instead.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  })

  await client.connect()
  try {
    await client.append(resolveSentFolder(), raw, ['\\Seen'])
  } finally {
    await client.logout().catch(() => {})
  }
}

export const emailReady = async (payload: Payload): Promise<boolean> => {
  await ensureEmailCredentialsLoaded(payload)
  return emailIsConfigured()
}
