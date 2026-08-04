import type { Metadata } from 'next'

import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import React from 'react'
import { ConfirmOrder } from '@/components/checkout/ConfirmOrder'

// User-flow page: session/query-state driven, noindexed — prerendering it
// has no value, and its client hooks (useSearchParams) forbid it anyway.
export const dynamic = 'force-dynamic'


export default function ConfirmOrderPage() {
  return (
    <div className="container min-h-[90vh] flex py-12">
      <ConfirmOrder />
    </div>
  )
}

export const metadata: Metadata = {
  // Utility page: never in the index.
  robots: { index: false, follow: false },
  description: 'Confirm order.',
  openGraph: mergeOpenGraph({
    title: 'Confirming order',
    url: '/checkout/confirm-order',
  }),
  title: 'Confirming order',
}
