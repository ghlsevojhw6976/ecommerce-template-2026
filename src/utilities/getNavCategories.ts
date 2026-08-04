import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Category, Media } from '@/payload-types'

/**
 * Category tree for navigation, memoised per request.
 *
 * Fetches the flat list once and assembles the tree in memory rather than
 * querying per level — two levels means two queries per render otherwise, on
 * every page of the site.
 */

export type NavCategory = {
  id: number | string
  title: string
  slug: string
  image?: Media | null
  children: NavCategory[]
}

const parentIdOf = (category: Category): string | null => {
  const parent = category.parent
  if (!parent) return null
  return String(typeof parent === 'object' ? parent.id : parent)
}

/** Explicit order first, then alphabetical so ties are stable rather than arbitrary. */
const byOrderThenTitle = (a: Category, b: Category): number => {
  const orderA = a.navOrder ?? 0
  const orderB = b.navOrder ?? 0
  if (orderA !== orderB) return orderA - orderB
  return (a.title ?? '').localeCompare(b.title ?? '')
}

export const getNavCategories = cache(async (): Promise<NavCategory[]> => {
  try {
    const payload = await getPayload({ config: configPromise })

    const { docs } = await payload.find({
      collection: 'categories',
      depth: 1,
      limit: 0,
      pagination: false,
      where: { showInNav: { not_equals: false } },
    })

    const categories = (docs as Category[]).filter((c) => c.slug)
    const sorted = [...categories].sort(byOrderThenTitle)

    const toNav = (category: Category): NavCategory => ({
      id: category.id,
      title: category.title,
      slug: category.slug!,
      image:
        category.image && typeof category.image === 'object' ? (category.image as Media) : null,
      children: [],
    })

    const byId = new Map<string, NavCategory>()
    for (const category of sorted) byId.set(String(category.id), toNav(category))

    const roots: NavCategory[] = []

    for (const category of sorted) {
      const node = byId.get(String(category.id))!
      const parentId = parentIdOf(category)
      const parent = parentId ? byId.get(parentId) : undefined

      // A child whose parent is hidden from nav (or deleted) is promoted to the
      // top level rather than vanishing — silently disappearing from navigation
      // is the worse failure.
      if (parent) parent.children.push(node)
      else roots.push(node)
    }

    return roots
  } catch {
    // Navigation must never take the site down.
    return []
  }
})
