import type { Company, Order } from '@/payload-types'

import { companyName } from '@/utilities/getCompany'
import { trackingUrlFor } from './carriers'

/**
 * Transactional email templates — plain table-based HTML with inline styles
 * (the only kind of HTML email clients render consistently; no CSS classes,
 * no external assets). All identity comes from the Company global, all money
 * is integer cents formatted here, and every template gets the same shell so
 * the shop's mail looks like one sender.
 *
 * Pure functions of (order, company, serverUrl) → string, so the whole file
 * is unit-testable without SMTP.
 */

const money = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

type OrderLine = {
  title: string
  quantity: number
  unitCents: number
  imageUrl: string | null
  productUrl: string | null
}

/**
 * Resolve order lines from a depth-2 order (products through defaultPopulate;
 * gallery images resolve at the second hop). Thumbnails go through the Next
 * image optimizer at 96px — an email must never pull a 2MB supplier JPG per
 * line item.
 */
export const orderLines = (order: Order, serverUrl?: string): OrderLine[] =>
  (order.items ?? [])
    .filter((line) => line.product && typeof line.product === 'object')
    .map((line) => {
      const product = line.product as {
        title?: string | null
        slug?: string | null
        priceInUSD?: number | null
        gallery?: { image?: { url?: string | null } | number | string | null }[] | null
        meta?: { image?: { url?: string | null } | number | string | null } | null
      }

      const firstImage = product.gallery?.find(
        (item) => item?.image && typeof item.image === 'object' && item.image.url,
      )?.image as { url?: string | null } | undefined
      const metaImage =
        product.meta?.image && typeof product.meta.image === 'object'
          ? (product.meta.image as { url?: string | null })
          : undefined
      const rawUrl = firstImage?.url || metaImage?.url || null

      return {
        title: product.title ?? 'Item',
        quantity: line.quantity || 1,
        unitCents: typeof product.priceInUSD === 'number' ? product.priceInUSD : 0,
        imageUrl:
          rawUrl && serverUrl
            ? `${serverUrl}/_next/image?url=${encodeURIComponent(rawUrl)}&w=96&q=90`
            : null,
        productUrl: product.slug && serverUrl ? `${serverUrl}/products/${product.slug}` : null,
      }
    })

const shell = (
  company: Partial<Company>,
  heading: string,
  bodyHtml: string,
  serverUrl?: string,
): string => {
  const name = escapeHtml(companyName(company))

  // Logo mark in the email header — requires the company fetched at depth ≥1
  // (depth 0 leaves logoMark as an ID and the email silently loses its logo).
  const mark =
    company.logoMark && typeof company.logoMark === 'object' && company.logoMark.url
      ? company.logoMark.url
      : null
  const logoUrl =
    mark && serverUrl ? `${serverUrl}/_next/image?url=${encodeURIComponent(mark)}&w=96&q=90` : null

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e5e0;">
        <tr><td style="padding:24px 32px 18px;border-bottom:1px solid #e5e5e0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            ${
              logoUrl
                ? `<td style="padding-right:12px;"><img src="${logoUrl}" alt="${name}" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:8px;"/></td>`
                : ''
            }
            <td style="vertical-align:middle;"><span style="font-size:20px;letter-spacing:0.02em;">${name}</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:normal;">${escapeHtml(heading)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #e5e5e0;font-size:12px;color:#6b6b66;">
          ${name}${company.supportEmail || company.email ? ` · <a href="mailto:${escapeHtml(company.supportEmail || company.email)}" style="color:#6b6b66;">${escapeHtml(company.supportEmail || company.email)}</a>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

const itemsTable = (lines: OrderLine[]): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">
  ${lines
    .map(
      (line) => `<tr>
    <td width="56" style="padding:8px 12px 8px 0;border-bottom:1px solid #efefec;">${(() => {
      const img = line.imageUrl
        ? `<img src="${line.imageUrl}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;object-fit:contain;border:1px solid #efefec;border-radius:6px;background:#ffffff;"/>`
        : `<span style="display:block;width:48px;height:48px;"></span>`
      return line.productUrl ? `<a href="${line.productUrl}">${img}</a>` : img
    })()}</td>
    <td style="padding:8px 0;border-bottom:1px solid #efefec;font-size:14px;">${
      line.productUrl
        ? `<a href="${line.productUrl}" style="color:#1a1a1a;text-decoration:underline;">${escapeHtml(line.title)}</a>`
        : escapeHtml(line.title)
    }${line.quantity > 1 ? ` &times; ${line.quantity}` : ''}</td>
    <td align="right" style="padding:8px 0;border-bottom:1px solid #efefec;font-size:14px;white-space:nowrap;">${money(line.unitCents * line.quantity)}</td>
  </tr>`,
    )
    .join('')}
</table>`

const addressBlock = (order: Order): string => {
  const address = order.shippingAddress
  if (!address?.addressLine1) return ''
  const parts = [
    [address.firstName, address.lastName].filter(Boolean).join(' '),
    address.addressLine1,
    address.addressLine2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
  ].filter(Boolean)
  return `<p style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6b6b66;margin:20px 0 4px;">Delivering to</p>
<p style="font-size:14px;line-height:1.6;margin:0;color:#44443f;">${parts
    .map(escapeHtml)
    .join('<br/>')}</p>`
}

const orderLink = (order: Order, serverUrl: string, email?: string | null): string => {
  const params = new URLSearchParams()
  if (email) params.set('email', email)
  if (order.accessToken) params.set('accessToken', order.accessToken)
  const qs = params.toString()
  return `${serverUrl}/orders/${order.id}${qs ? `?${qs}` : ''}`
}

export const orderConfirmationEmail = ({
  order,
  company,
  serverUrl,
}: {
  order: Order
  company: Partial<Company>
  serverUrl: string
}): { subject: string; html: string } => {
  const lines = orderLines(order, serverUrl)
  const total = typeof order.amount === 'number' ? order.amount : 0
  const link = orderLink(order, serverUrl, order.customerEmail)
  const returnsDays = company.returnWindowDays

  const body = `
<p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Thank you for your order. Here is what we received:</p>
${itemsTable(lines)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="font-size:15px;padding:4px 0;">Total (shipping &amp; duties included)</td>
  <td align="right" style="font-size:17px;padding:4px 0;white-space:nowrap;"><strong>${money(total)}</strong></td>
</tr></table>
${addressBlock(order)}
<p style="margin:24px 0 0;">
  <a href="${link}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 24px;font-size:14px;">View your order</a>
</p>
<p style="font-size:13px;line-height:1.6;color:#6b6b66;margin:20px 0 0;">
  We will email you a tracking number as soon as your order ships.${
    typeof returnsDays === 'number' && returnsDays > 0
      ? ` Returns are accepted within ${returnsDays} days of delivery.`
      : ''
  }
</p>`

  return {
    subject: `Order #${order.id} confirmed — ${companyName(company)}`,
    html: shell(company, `Order #${order.id} confirmed`, body, serverUrl),
  }
}

export const orderShippedEmail = ({
  order,
  company,
  serverUrl,
  trackingNumber,
  carrier,
}: {
  order: Order
  company: Partial<Company>
  serverUrl: string
  trackingNumber: string
  carrier?: string | null
}): { subject: string; html: string } => {
  const trackingUrl = trackingUrlFor(carrier, trackingNumber)
  const link = orderLink(order, serverUrl, order.customerEmail)

  const body = `
<p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Your order is on its way.</p>
<p style="font-size:15px;line-height:1.8;margin:0;">
  Tracking number: <strong style="white-space:nowrap;">${escapeHtml(trackingNumber)}</strong>
</p>
${
  trackingUrl
    ? `<p style="margin:20px 0 0;"><a href="${trackingUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 24px;font-size:14px;">Track your parcel</a></p>`
    : ''
}
${addressBlock(order)}
<p style="font-size:13px;line-height:1.6;color:#6b6b66;margin:20px 0 0;">
  You can also see the status any time on <a href="${link}" style="color:#6b6b66;">your order page</a>.
</p>`

  return {
    subject: `Order #${order.id} has shipped — ${companyName(company)}`,
    html: shell(company, 'Your order has shipped', body, serverUrl),
  }
}

export const orderAccessEmail = ({
  order,
  company,
  serverUrl,
  email,
}: {
  order: Order
  company: Partial<Company>
  serverUrl: string
  email: string
}): { subject: string; html: string } => {
  const link = orderLink(order, serverUrl, email)
  const body = `
<p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Use the button below to open your order details.</p>
<p style="margin:20px 0 0;">
  <a href="${link}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 24px;font-size:14px;">View order #${order.id}</a>
</p>
<p style="font-size:13px;line-height:1.6;color:#6b6b66;margin:20px 0 0;">
  If you did not request this link, you can ignore this email.
</p>`

  return {
    subject: `Access your order #${order.id} — ${companyName(company)}`,
    html: shell(company, `Your order access link`, body, serverUrl),
  }
}
