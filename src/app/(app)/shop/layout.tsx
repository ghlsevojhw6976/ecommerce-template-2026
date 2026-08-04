import { Search } from '@/components/Search'
import React, { Suspense } from 'react'

/**
 * Shop layout.
 *
 * Deliberately thin. This previously rendered its own category list and sort
 * control, which duplicated the ones on the page — two sidebars on screen at
 * once, two competing sort mechanisms, and a flat category list that ignored
 * the parent/child tree entirely.
 *
 * Filtering belongs on the page, where the active category is already resolved
 * and the tree is available. What remains here is search, which is shared by
 * every view under /shop. The page owns its own container, so padding is not
 * applied twice.
 */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Fragment>
      <div className="container pt-[var(--space-block)]">
        <Suspense fallback={null}>
          <Search />
        </Suspense>
      </div>
      {children}
    </React.Fragment>
  )
}
