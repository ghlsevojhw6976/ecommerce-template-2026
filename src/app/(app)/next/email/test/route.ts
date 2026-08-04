import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { checkRole } from '@/access/utilities'
import { emailSource, ensureEmailCredentialsLoaded, resolveImapConfig, resolveSmtpConfig } from '@/lib/email/keys'
import { sendShopEmail } from '@/lib/email/transport'

export const maxDuration = 60

/**
 * Settings → Email health check. GET reports what is configured and from
 * which source; POST sends a real test email to the logged-in admin —
 * the only proof that SMTP credentials actually work.
 */

const authed = async () => {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || !checkRole(['admin'], user)) return { payload, user: null }
  return { payload, user }
}

export async function GET(): Promise<Response> {
  const { payload, user } = await authed()
  if (!user) return new Response('Action forbidden.', { status: 403 })

  await ensureEmailCredentialsLoaded(payload)
  const smtp = resolveSmtpConfig()
  const imap = resolveImapConfig()

  return Response.json({
    source: emailSource(),
    smtp: smtp ? { host: smtp.host, port: smtp.port, user: smtp.user } : null,
    imap: imap ? { host: imap.host, port: imap.port, user: imap.user } : null,
  })
}

export async function POST(): Promise<Response> {
  const { payload, user } = await authed()
  if (!user) return new Response('Action forbidden.', { status: 403 })

  try {
    const result = await sendShopEmail(payload, {
      to: user.email,
      subject: 'Test email — shop mailbox is working',
      html: '<p>This is the test email from Settings → Email. Sending works.</p>',
      text: 'This is the test email from Settings → Email. Sending works.',
    })
    return Response.json({ sent: true, to: user.email, messageId: result.messageId })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Send failed.', { status: 500 })
  }
}
