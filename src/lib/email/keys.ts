import type { Payload } from 'payload'

import { open } from '@/lib/crypto/secretBox'

/**
 * Where mail credentials come from, in precedence order — the exact model of
 * src/lib/stripe/keys.ts, because it is the same problem:
 *
 *   1. Admin — Settings → Email, passwords stored encrypted in the database
 *   2. Environment — SMTP_HOST / SMTP_USER / … as the deploy-time fallback
 *
 * Cache lives on globalThis (Next duplicates module state per bundle; HMR
 * re-evaluates modules) with a TTL so multi-instance deploys converge after
 * an admin edit. The global's afterChange hook refreshes the local process
 * immediately.
 */

export type EmailSource = 'admin' | 'env' | 'none'

export type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

export type ImapConfig = {
  host: string
  port: number
  user: string
  pass: string
}

type EmailCache = {
  loaded: boolean
  loadedAt: number
  payload?: Payload
  refreshPromise?: Promise<void>
  smtp?: SmtpConfig
  imap?: ImapConfig
  fromName?: string
  fromAddress?: string
  /** IMAP folder to append sent mail into. */
  sentFolder?: string
  /** Appended to Mail-view replies. */
  signature?: string
  /** Reply-To header for all outgoing mail; empty = replies go to From. */
  replyTo?: string
  source: EmailSource
}

const CACHE_TTL_MS = 30_000

const globalStore = globalThis as unknown as { __emailCredentialCache?: EmailCache }

const cache = (): EmailCache => {
  if (!globalStore.__emailCredentialCache) {
    globalStore.__emailCredentialCache = { loaded: false, loadedAt: 0, source: 'none' }
  }
  return globalStore.__emailCredentialCache
}

const envSmtp = (): SmtpConfig | undefined => {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  if (!host || !user || !pass) return undefined
  const port = Number(process.env.SMTP_PORT) || 465
  return { host, port, secure: port === 465, user, pass }
}

const envImap = (): ImapConfig | undefined => {
  const smtp = envSmtp()
  const host = process.env.IMAP_HOST?.trim() || smtp?.host
  const user = process.env.IMAP_USER?.trim() || smtp?.user
  const pass = process.env.IMAP_PASS?.trim() || smtp?.pass
  if (!host || !user || !pass) return undefined
  return { host, port: Number(process.env.IMAP_PORT) || 993, user, pass }
}

/** Read the email-settings global doc into the cache. */
export const applyEmailSettingsDoc = (doc: Record<string, any> | null | undefined): void => {
  const store = cache()
  store.loaded = true
  store.loadedAt = Date.now()

  const smtp = doc?.smtp
  const smtpPass = open(smtp?.passwordEnc)

  if (smtp?.host?.trim() && smtp?.username?.trim() && smtpPass) {
    const port = Number(smtp.port) || 465
    store.smtp = {
      host: smtp.host.trim(),
      port,
      secure: smtp.secure ?? port === 465,
      user: smtp.username.trim(),
      pass: smtpPass,
    }
    store.source = 'admin'
  } else {
    store.smtp = envSmtp()
    store.source = store.smtp ? 'env' : 'none'
  }

  const imap = doc?.imap
  const sameCreds = imap?.sameCredentials !== false
  const imapPass = sameCreds ? smtpPass : open(imap?.passwordEnc)
  // Host is independent of sameCredentials — that flag only governs
  // username/password reuse. The IMAP host field falls back to the SMTP
  // host ONLY when left blank (its own admin description), never gets
  // overridden by an explicitly-set IMAP host just because sameCredentials
  // is checked. Getting this wrong sends IMAP connections to the SMTP
  // host on the IMAP port — TLS still shakes hands (same edge/cert), but
  // the protocol read then resets, surfacing as a bare ECONNRESET with no
  // hint it's a wrong-host problem.
  const imapHost = (imap?.host?.trim() || smtp?.host)?.trim()
  const imapUser = (sameCreds ? smtp?.username : imap?.username)?.trim()

  if (imapHost && imapUser && imapPass) {
    store.imap = {
      host: imapHost,
      port: Number(imap?.port) || 993,
      user: imapUser,
      pass: imapPass,
    }
  } else {
    store.imap = store.source === 'admin' ? undefined : envImap()
  }

  store.fromName = doc?.fromName?.trim() || undefined
  store.fromAddress = doc?.fromAddress?.trim() || store.smtp?.user
  store.sentFolder = doc?.imap?.sentFolder?.trim() || 'Sent'
  store.signature = doc?.signature?.trim() || undefined
  store.replyTo = doc?.replyToAddress?.trim() || undefined
}

export const loadEmailCredentials = async (payload: Payload): Promise<void> => {
  const store = cache()
  store.payload = payload
  try {
    const doc = await payload.findGlobal({
      slug: 'email-settings',
      depth: 0,
      overrideAccess: true,
    })
    applyEmailSettingsDoc(doc as Record<string, any>)
  } catch {
    applyEmailSettingsDoc(null)
  }
}

/**
 * Await before reading config on a request path; refreshes past the TTL.
 * Concurrent callers AWAIT the same in-flight refresh rather than reading
 * stale — the earlier fire-and-skip version let the first request after an
 * admin save resolve "not configured" while the refresh it triggered was
 * still running.
 */
export const ensureEmailCredentialsLoaded = async (payload?: Payload): Promise<void> => {
  const store = cache()
  const stale = !store.loaded || Date.now() - store.loadedAt > CACHE_TTL_MS
  if (!stale) return
  const client = payload ?? store.payload
  if (!client) return
  if (!store.refreshPromise) {
    store.refreshPromise = loadEmailCredentials(client).finally(() => {
      store.refreshPromise = undefined
    })
  }
  await store.refreshPromise
}

export const resolveSmtpConfig = (): SmtpConfig | undefined => cache().smtp
export const resolveImapConfig = (): ImapConfig | undefined => cache().imap
export const resolveSentFolder = (): string => cache().sentFolder || 'Sent'
export const resolveSignature = (): string | undefined => cache().signature
export const resolveReplyTo = (): string | undefined => cache().replyTo
export const emailSource = (): EmailSource => cache().source

export const resolveFrom = (companyName?: string): { name: string; address: string } | null => {
  const store = cache()
  if (!store.smtp) return null
  return {
    name: store.fromName || companyName || 'Shop',
    address: store.fromAddress || store.smtp.user,
  }
}

export const emailIsConfigured = (): boolean => Boolean(cache().smtp)
