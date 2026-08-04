import type { EmailAdapter } from 'payload'

import { sendShopEmail } from './transport'

/**
 * Payload email adapter backed by the admin-managed mailbox.
 *
 * Exists so payload.sendEmail (password resets, the order-access email —
 * everything Payload sends on its own) rides the same dynamic SMTP
 * credentials as the shop's transactional email, instead of freezing
 * whatever existed at boot. The stock nodemailerAdapter captures its
 * transport at config time — the same freezing problem the Stripe adapter
 * had, solved the same way: resolve per send.
 *
 * defaultFrom* are placeholders only; sendShopEmail resolves the real From
 * from Settings → Email at send time.
 */
export const dynamicEmailAdapter: EmailAdapter<{ messageId: string }> = ({ payload }) => ({
  name: 'shop-mailbox',
  defaultFromAddress: process.env.SMTP_USER || 'noreply@localhost',
  defaultFromName: 'Shop',
  sendEmail: async (message) => {
    const to = Array.isArray(message.to) ? message.to.join(', ') : message.to
    return sendShopEmail(payload, {
      to: typeof to === 'string' ? to : String(to ?? ''),
      subject: message.subject ?? '',
      html: typeof message.html === 'string' ? message.html : '',
      ...(typeof message.text === 'string' ? { text: message.text } : {}),
    })
  },
})
