import configPromise from '@payload-config'
import { BadgeCheck } from 'lucide-react'
import Image from 'next/image'
import { getPayload } from 'payload'
import React from 'react'

import type { Media, Product, Review } from '@/payload-types'
import { getCompany } from '@/utilities/getCompany'
import { Rating } from './Rating'

/**
 * Reviews section.
 *
 * Server component, and it renders **nothing** when a product has no approved
 * reviews. That is the universal-by-design requirement: shops running this
 * template may never collect reviews, and an empty "Be the first to review!"
 * block on a €900 product advertises that nobody has bought it.
 *
 * Three things here are deliberate, each from a documented Baymard gap:
 *  - customer photos are shown and browsable (63% of sites make this hard);
 *    buyers treat them as objective evidence in a way they never treat ours
 *  - merchant responses render attached to their review (89% of sites never
 *    answer negative reviews — a visible, non-defensive reply improves
 *    confidence even for the person reading the complaint)
 *  - verified-purchase status is a badge, because it changes how much trust a
 *    review earns
 */

const REVIEWS_SHOWN = 8

const formatDate = (value?: string | null): string => {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

export const Reviews: React.FC<{
  product: Product
  /** The whole family's product ids — reviews pool across siblings. */
  familyIds?: (number | string)[]
  pooledRating?: { average: number | null; count: number }
}> = async ({ product, familyIds, pooledRating }) => {
  // Sitewide kill switch (Settings → Company → Policies). Checked first —
  // cheapest possible gate, and the review query below never runs at all
  // when off.
  const company = await getCompany()
  if (company.reviewsEnabled === false) return null

  const ratingCount = pooledRating ? pooledRating.count : product.ratingCount
  const ratingAverage = pooledRating ? pooledRating.average : product.ratingAverage

  // Cheap gate: the aggregates live on the products, so a family with no
  // reviews never triggers a query at all.
  if (!ratingCount) return null

  const payload = await getPayload({ config: configPromise })

  // Pool across the family: a review of the Cream colourway tells a buyer of
  // the Blue one everything they need — splitting counts across siblings is
  // Baymard's severe-failure case (9 shown when the family holds 40).
  const productIds =
    familyIds && familyIds.length > 1 ? familyIds : [product.id]

  const { docs } = await payload.find({
    collection: 'reviews',
    depth: 1,
    limit: REVIEWS_SHOWN,
    sort: '-createdAt',
    where: {
      and: [{ product: { in: productIds } }, { status: { equals: 'approved' } }],
    },
  })

  const reviews = docs as Review[]
  if (!reviews.length) return null

  return (
    <section
      aria-labelledby="reviews-heading"
      className="border-t border-border py-[var(--space-section)]"
    >
      <div className="container">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-2xl md:text-3xl" id="reviews-heading">
            Reviews
          </h2>
          <Rating average={ratingAverage} count={ratingCount} />
        </div>
        <p className="mb-[var(--space-block)] text-xs text-muted-foreground">
          Reviews reflect customer experiences with this product, gathered across retail
          channels.
        </p>

        <ul className="grid gap-x-12 gap-y-10 md:grid-cols-2">
          {reviews.map((review) => {
            const photos = (review.images ?? [])
              .map((entry) => entry?.image)
              .filter((img): img is Media => Boolean(img && typeof img === 'object' && img.url))

            return (
              <li className="flex flex-col gap-3" key={review.id}>
                <div className="flex items-center gap-3">
                  <Rating average={review.rating} count={1} showCount={false} size="sm" />
                  {review.verifiedPurchase && (
                    <span className="flex items-center gap-1 text-2xs uppercase tracking-[0.1em] text-muted-foreground">
                      <BadgeCheck aria-hidden size={12} strokeWidth={2} />
                      Verified
                    </span>
                  )}
                </div>

                {review.title && (
                  <h3 className="font-display text-lg leading-snug">{review.title}</h3>
                )}

                <p className="prose-measure text-sm leading-relaxed text-muted-foreground">
                  {review.body}
                </p>

                {photos.length > 0 && (
                  <ul className="flex gap-2 overflow-x-auto pb-1">
                    {photos.map((photo, i) => (
                      <li className="shrink-0" key={i}>
                        <Image
                          alt={photo.alt || `Customer photo ${i + 1}`}
                          className="h-20 w-20 rounded-[var(--radius)] border border-border object-cover"
                          height={80}
                          src={photo.url!}
                          width={80}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-xs text-muted-foreground">
                  {review.authorName}
                  {review.authorLocation ? ` · ${review.authorLocation}` : ''}
                  {review.variantPurchased ? ` · ${review.variantPurchased}` : ''}
                  {' · '}
                  {formatDate(review.originalCreatedAt || review.createdAt)}
                </p>

                {review.merchantResponse && (
                  <div className="mt-1 border-l-2 border-border pl-4">
                    <p className="mb-1 text-2xs uppercase tracking-[0.1em] text-muted-foreground">
                      Our response
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {review.merchantResponse}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
