import type { Metadata } from 'next'

import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import React from 'react'

import { LogoutPage } from './LogoutPage'

// User-flow page: session/query-state driven, noindexed — prerendering it
// has no value, and its client hooks (useSearchParams) forbid it anyway.
export const dynamic = 'force-dynamic'


export default async function Logout() {
  return (
    <div className="container max-w-lg my-16">
      <LogoutPage />
    </div>
  )
}

export const metadata: Metadata = {
  // Utility page: never in the index.
  robots: { index: false, follow: false },
  description: 'You have been logged out.',
  openGraph: mergeOpenGraph({
    title: 'Logout',
    url: '/logout',
  }),
  title: 'Logout',
}
