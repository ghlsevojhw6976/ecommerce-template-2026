'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useTransition } from 'react'

export const SORT_OPTIONS = [
  { label: 'Featured', value: '' },
  { label: 'Price, low to high', value: 'priceInUSD' },
  { label: 'Price, high to low', value: '-priceInUSD' },
  { label: 'Newest', value: '-createdAt' },
  { label: 'Name, A–Z', value: 'title' },
] as const

/** Only these may reach the query — see the note in the shop page. */
export const ALLOWED_SORTS = SORT_OPTIONS.map((o) => o.value).filter(Boolean) as string[]

/**
 * Sort control.
 *
 * Always navigates to the DYNAMIC /search route: the /shop pages are static
 * and served from cache, which means they cannot see a ?sort= at all — a
 * sorted view is a different rendering of the same list and must be a live
 * request. The active category rides along as ?category= so sorting never
 * dumps the user back into the full catalogue.
 */
export const SortSelect: React.FC<{ categorySlug?: string }> = ({ categorySlug }) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const current = searchParams.get('sort') ?? ''

  const onChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set('sort', value)
      else params.delete('sort')
      if (categorySlug) params.set('category', categorySlug)
      // Sorting restarts at the first page — page N of a different order is
      // meaningless.
      params.delete('page')

      startTransition(() => {
        router.push(`/search${params.toString() ? `?${params}` : ''}`, { scroll: false })
      })
    },
    [router, searchParams, categorySlug],
  )

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Sort</span>
      <select
        className="border border-input bg-background px-3 py-1.5 text-sm transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
        disabled={isPending}
        onChange={(e) => onChange(e.target.value)}
        style={{ borderRadius: 'var(--radius)' }}
        value={current}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
