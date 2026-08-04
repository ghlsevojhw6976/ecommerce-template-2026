import type { Product } from '@/payload-types'

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import React from 'react'

import { cn } from '@/utilities/cn'

/**
 * The option selector for product families — colour/size siblings that are
 * SEPARATE products sharing an `itemGroupId`.
 *
 * Selecting an option NAVIGATES to the sibling's own page (the Amazon model)
 * instead of switching state in place. Every sibling page then carries its own
 * photography, title, GTIN, price and copy — which is also exactly the shape
 * Google's feed requires (one offer per variant, own link, shared
 * item_group_id). Next's <Link> prefetches on viewport, so the navigation is
 * near-instant in production.
 *
 * Server component: siblings come from one indexed query, and the selector is
 * plain links — nothing here needs client state. The Baymard failure mode this
 * design must avoid is UNLINKED or desynchronised siblings, so options render
 * per axis (colour, size) with the current page's value marked active, and a
 * combination that has no page renders as a plain label, never a dead link.
 */

type Sibling = {
  id: number | string
  slug: string
  title: string
  variantLabel?: string | null
  color?: string | null
  size?: string | null
  inventory?: number | null
}

export const getFamily = async (product: Product): Promise<Sibling[]> => {
  if (!product.itemGroupId) return []

  const payload = await getPayload({ config: configPromise })

  const { docs } = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 50,
    pagination: false,
    sort: 'title',
    select: {
      slug: true,
      title: true,
      variantLabel: true,
      color: true,
      size: true,
      inventory: true,
      ratingAverage: true,
      ratingCount: true,
    },
    where: {
      and: [
        { itemGroupId: { equals: product.itemGroupId } },
        { _status: { equals: 'published' } },
      ],
    },
  })

  return docs as unknown as Sibling[]
}

const AXES: { key: 'color' | 'size'; label: string }[] = [
  { key: 'color', label: 'Colour' },
  { key: 'size', label: 'Size' },
]

export const FamilySelector: React.FC<{ product: Product; family: Sibling[] }> = ({
  product,
  family,
}) => {
  if (family.length < 2) return null

  const current = family.find((sibling) => String(sibling.id) === String(product.id))

  // Axis rows only make sense when the axis actually varies across the family.
  const axesInUse = AXES.filter(
    ({ key }) => new Set(family.map((s) => s[key]?.trim()).filter(Boolean)).size > 1,
  )

  // Families whose rows only differ by a free-form label (no clean colour/size
  // split) get one row of label chips instead of nothing.
  if (!axesInUse.length) {
    return (
      <dl>
        <dt className="mb-4 text-sm">Options</dt>
        <dd className="flex flex-wrap gap-3">
          {family.map((sibling) => (
            <Chip
              active={String(sibling.id) === String(product.id)}
              href={`/products/${sibling.slug}`}
              key={sibling.id}
              label={sibling.variantLabel || sibling.title}
            />
          ))}
        </dd>
      </dl>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {axesInUse.map(({ key, label }) => {
        const values = [...new Set(family.map((s) => s[key]?.trim()).filter(Boolean))] as string[]

        return (
          <dl key={key}>
            <dt className="mb-4 text-sm">{label}</dt>
            <dd className="flex flex-wrap gap-3">
              {values.map((value) => {
                // Best match: the sibling sharing the rest of the current
                // page's axes with only THIS axis changed; otherwise any
                // sibling carrying the value. Every rendered chip is a real
                // page — the intersection trap of the old in-page selector
                // (combinations matching no variant) cannot exist here.
                const otherAxes = axesInUse.filter((axis) => axis.key !== key)
                const exact = family.find(
                  (s) =>
                    s[key]?.trim() === value &&
                    otherAxes.every(
                      (axis) => (s[axis.key]?.trim() ?? '') === (current?.[axis.key]?.trim() ?? ''),
                    ),
                )
                const target = exact ?? family.find((s) => s[key]?.trim() === value)

                if (!target) return null

                return (
                  <Chip
                    active={value === current?.[key]?.trim()}
                    href={`/products/${target.slug}`}
                    key={value}
                    label={value}
                  />
                )
              })}
            </dd>
          </dl>
        )
      })}
    </div>
  )
}

const Chip: React.FC<{ active: boolean; href: string; label: string }> = ({
  active,
  href,
  label,
}) => {
  const className = cn(
    'flex min-w-[48px] items-center justify-center border px-3 py-2 text-sm transition-colors',
    active
      ? 'cursor-default border-foreground bg-foreground text-background'
      : 'border-border hover:border-foreground',
  )

  // The current page's own value is a state, not a destination.
  if (active) {
    return (
      <span aria-current="true" className={className}>
        {label}
      </span>
    )
  }

  return (
    <Link className={className} href={href}>
      {label}
    </Link>
  )
}
