import { describe, it, expect } from 'vitest'

import { trackingUrlFor } from '@/lib/email/carriers'
import {
  orderAccessEmail,
  orderConfirmationEmail,
  orderShippedEmail,
} from '@/lib/email/templates'
import type { Order } from '@/payload-types'

/**
 * Transactional email contract: branded from the Company global, money in
 * cents formatted once, order links carry the access token, and user data is
 * HTML-escaped (a product title is CSV-imported text going into an email).
 */

const company = {
  name: 'Acme Housewares',
  supportEmail: 'help@acme.test',
  returnWindowDays: 30,
  logoMark: { id: 1, url: '/api/media/file/mark.png', alt: 'mark' },
} as never as Record<string, unknown>

const order = {
  id: 131,
  amount: 279995,
  currency: 'USD',
  customerEmail: 'buyer@example.com',
  accessToken: 'tok-abc',
  items: [
    {
      product: {
        title: 'Grill <XL> & Co',
        slug: 'grill-xl',
        priceInUSD: 139999,
        gallery: [{ image: { url: '/api/media/file/grill.jpg' } }],
      },
      quantity: 2,
    },
    { product: 55, quantity: 1 }, // unresolved product — skipped
  ],
  shippingAddress: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    addressLine1: '1 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
  },
} as unknown as Order

describe('orderConfirmationEmail', () => {
  const message = orderConfirmationEmail({ order, company, serverUrl: 'https://shop.test' })

  it('brands from the Company global and totals in dollars', () => {
    expect(message.subject).toBe('Order #131 confirmed — Acme Housewares')
    expect(message.html).toContain('Acme Housewares')
    expect(message.html).toContain('$2,799.95') // charged total from order.amount
    expect(message.html).toContain('$2,799.98') // line total: 139999 × 2
  })

  it('escapes HTML in imported titles', () => {
    expect(message.html).toContain('Grill &lt;XL&gt; &amp; Co')
    expect(message.html).not.toContain('Grill <XL>')
  })

  it('links the order page with email + access token', () => {
    expect(message.html).toContain(
      'https://shop.test/orders/131?email=buyer%40example.com&accessToken=tok-abc',
    )
  })

  it('quotes the returns window from Company', () => {
    expect(message.html).toContain('within 30 days')
  })

  it('renders a line-item thumbnail through the image optimizer, never the raw file', () => {
    expect(message.html).toContain(
      'https://shop.test/_next/image?url=%2Fapi%2Fmedia%2Ffile%2Fgrill.jpg&w=96&q=90',
    )
    expect(message.html).not.toContain('src="/api/media/file/grill.jpg"')
  })

  it('renders the shop logo mark in the header (requires depth-1 company)', () => {
    expect(message.html).toContain(
      'https://shop.test/_next/image?url=%2Fapi%2Fmedia%2Ffile%2Fmark.png&w=96&q=90',
    )
  })

  it('links the product name and thumbnail to the product page', () => {
    expect(message.html).toContain(
      '<a href="https://shop.test/products/grill-xl" style="color:#1a1a1a;text-decoration:underline;">Grill &lt;XL&gt; &amp; Co</a>',
    )
  })

  it('shows the delivery address with its label', () => {
    expect(message.html).toContain('Delivering to')
    expect(message.html).toContain('Ada Lovelace')
    expect(message.html).toContain('1 Main St')
    expect(message.html).toContain('Austin, TX, 78701')
  })
})

describe('orderShippedEmail', () => {
  it('carries the tracking number and the carrier deep link', () => {
    const message = orderShippedEmail({
      order,
      company,
      serverUrl: 'https://shop.test',
      trackingNumber: '9400 1000 0000',
      carrier: 'usps',
    })
    expect(message.subject).toContain('has shipped')
    expect(message.html).toContain('9400 1000 0000')
    expect(message.html).toContain('tools.usps.com')
  })

  it('omits the tracking button for an unknown carrier but keeps the number', () => {
    const message = orderShippedEmail({
      order,
      company,
      serverUrl: 'https://shop.test',
      trackingNumber: 'XYZ123',
      carrier: 'other',
    })
    expect(message.html).toContain('XYZ123')
    expect(message.html).not.toContain('Track your parcel')
  })
})

describe('orderAccessEmail', () => {
  it('builds the tokenised link for the requested email', () => {
    const message = orderAccessEmail({
      order,
      company,
      serverUrl: 'https://shop.test',
      email: 'buyer@example.com',
    })
    expect(message.html).toContain('accessToken=tok-abc')
    expect(message.subject).toContain('#131')
  })
})

describe('trackingUrlFor', () => {
  it('maps every carrier and URL-encodes the number', () => {
    expect(trackingUrlFor('ups', '1Z 999')).toBe('https://www.ups.com/track?tracknum=1Z%20999')
    expect(trackingUrlFor('fedex', '12')).toContain('fedex.com')
    expect(trackingUrlFor('dhl', '12')).toContain('dhl.com')
    expect(trackingUrlFor('dpd', '099812345')).toBe(
      'https://tracking.dpd.de/status/en_US/parcel/099812345',
    )
    expect(trackingUrlFor('other', '12')).toBeNull()
    expect(trackingUrlFor(null, '12')).toBeNull()
  })
})
