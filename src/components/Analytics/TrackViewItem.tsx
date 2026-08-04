'use client'

import { useEffect } from 'react'

import { trackViewItem, type GaItem } from '@/lib/analytics/gtag'

/**
 * Fires GA4 view_item once per PDP mount. A client island because the PDP is
 * a static server component — the item payload is computed server-side and
 * serialized into the page, so the event carries real price/discount data
 * without any client fetch.
 */
export function TrackViewItem({ item }: { item: GaItem }) {
  useEffect(() => {
    trackViewItem(item)
    // The payload identifies the page; re-firing on client-side identity
    // changes of the same object would double-count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.item_id])

  return null
}
