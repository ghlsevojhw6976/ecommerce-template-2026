import type { Metadata } from 'next'

import config from '@payload-config'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import Link from 'next/link'
import { getPayload } from 'payload'
import React from 'react'

import { CheckoutPage } from '@/components/checkout/CheckoutPage'
import { ensureStripeCredentialsLoaded, resolveStripeSecretKey } from '@/lib/stripe/keys'

// User-flow page: session/query-state driven, noindexed — prerendering it
// has no value, and its client hooks (useSearchParams) forbid it anyway.
export const dynamic = 'force-dynamic'


export default async function Checkout() {
  // Hosted Checkout needs only the SECRET key (sessions are created
  // server-side; no Stripe.js runs on this site). Without one, no payment can
  // possibly be taken — say so in customer language and stop.
  //
  // ensure() loads admin-stored keys into the keystore if this bundle has not
  // seen them yet, so this page reflects a key pasted in Settings → Stripe as
  // well as env vars.
  const payload = await getPayload({ config })
  await ensureStripeCredentialsLoaded(payload)

  if (!resolveStripeSecretKey()) {
    console.error(
      'Checkout unavailable: no Stripe secret key in admin settings or STRIPE_SECRET_KEY.',
    )

    return (
      <div className="container min-h-[60vh] py-16">
        <h1 className="mb-4 font-display text-3xl">Checkout is temporarily unavailable</h1>
        <p className="max-w-prose text-muted-foreground">
          We cannot take payments right now. Please try again shortly, or{' '}
          <Link className="underline" href="/contact">
            contact us
          </Link>{' '}
          and we will help you complete your order.
        </p>
      </div>
    )
  }

  return (
    <div className="container min-h-[90vh] flex">
      <h1 className="sr-only">Checkout</h1>

      <CheckoutPage />
    </div>
  )
}

export const metadata: Metadata = {
  // Utility page: never in the index.
  robots: { index: false, follow: false },
  description: 'Checkout.',
  openGraph: mergeOpenGraph({
    title: 'Checkout',
    url: '/checkout',
  }),
  title: 'Checkout',
}
