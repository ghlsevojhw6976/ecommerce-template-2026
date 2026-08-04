import { getPayload } from 'payload'
import config from '@payload-config'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'

import { ensureEmailCredentialsLoaded, resolveImapConfig, resolveSmtpConfig } from '@/lib/email/keys'

/**
 * Diagnostic: resolves the ACTUAL admin-stored (decrypted) SMTP/IMAP config
 * via the same path the app uses, then tries connecting with it — to rule
 * out "the pasted-in-chat password differs from what's actually stored".
 *
 *   pnpm exec tsx --env-file=.env src/scripts/diagnose-mail.ts
 */

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  await ensureEmailCredentialsLoaded(payload)

  const smtp = resolveSmtpConfig()
  const imap = resolveImapConfig()

  console.log('--- Resolved SMTP config ---')
  console.log(
    smtp
      ? { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, passLen: smtp.pass.length }
      : 'NOT CONFIGURED',
  )
  console.log('--- Resolved IMAP config ---')
  console.log(
    imap ? { host: imap.host, port: imap.port, user: imap.user, passLen: imap.pass.length } : 'NOT CONFIGURED',
  )

  if (smtp) {
    console.log('--- SMTP verify ---')
    try {
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
      })
      const ok = await transport.verify()
      console.log('SMTP verify:', ok)
    } catch (err: any) {
      console.log('SMTP verify FAILED:', err.code, err.message)
    }
  }

  if (imap) {
    console.log('--- IMAP connect ---')
    const client = new ImapFlow({
      host: imap.host,
      port: imap.port,
      secure: true,
      auth: { user: imap.user, pass: imap.pass },
      logger: false,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    })
    try {
      await client.connect()
      const status = await client.status('INBOX', { unseen: true, messages: true })
      console.log('IMAP connected. INBOX status:', status)
      await client.logout()
    } catch (err: any) {
      console.log('IMAP FAILED:', err.code, err.message)
    }
  }

  process.exit(0)
}

run()
