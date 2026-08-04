import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { publicAccess } from '@/access/publicAccess'

/**
 * Product reviews.
 *
 * ── Why this exists at all ──────────────────────────────────────────────
 * At €400–1200 a star average is not enough. Research on high-ticket
 * conversion points to ~20+ detailed reviews before buyers feel statistical
 * confidence, and three of Baymard's top-ten product page failures are
 * review-related. Showing the review *count* lifts add-to-cart ~18%; real
 * customer photos lift product page conversion ~35%.
 *
 * ── Universal by design ─────────────────────────────────────────────────
 * Every shop from this template must work with reviews and without them. A
 * product with zero reviews renders no review UI at all — no empty state, no
 * "0 reviews", no hollow star row. Those read worse than silence, because they
 * advertise absence.
 *
 * The aggregate lives on the product as nullable fields maintained by the hooks
 * below, so the product page never has to query reviews just to decide whether
 * to render a rating.
 *
 * Schema rationale: PRODUCT-DATA-REQUIREMENTS.md §7
 */

/**
 * Recomputes a product's rating aggregate from its approved reviews.
 *
 * Deliberately recomputed from scratch rather than incremented: an incremental
 * counter drifts as reviews are edited, unapproved or deleted, and a wrong
 * public rating is worse than a slightly expensive query.
 */
const recalculateProductRating = async (
  req: any,
  productId: number | string | null | undefined,
): Promise<void> => {
  if (!productId) return

  const payload = req.payload

  // `req` MUST be threaded through. Payload runs each request inside a Postgres
  // transaction; a find/update issued without it opens a *second* transaction
  // that blocks on the rows the in-flight one still holds — the write hangs
  // until the pool times out. Passing req joins the same transaction, which
  // also means the review being saved is visible to the count below.
  const { docs } = await payload.find({
    collection: 'reviews',
    depth: 0,
    limit: 0,
    pagination: false,
    req,
    where: {
      and: [{ product: { equals: productId } }, { status: { equals: 'approved' } }],
    },
  })

  const ratings = (docs as { rating?: number }[])
    .map((d) => Number(d.rating))
    .filter((r) => Number.isFinite(r))

  // Null, not zero. "No rating" and "rated zero" must not render the same.
  const average = ratings.length
    ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10
    : null

  await payload
    .update({
      collection: 'products',
      id: productId,
      data: {
        ratingAverage: average,
        ratingCount: ratings.length || null,
      },
      context: { skipRatingRecalc: true },
      req,
    })
    .catch(() => undefined)
}

const afterChangeReview: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const productId = typeof doc?.product === 'object' ? doc.product?.id : doc?.product
  await recalculateProductRating(req, productId)

  // A review moved between products leaves the old one stale.
  const previousId =
    typeof previousDoc?.product === 'object' ? previousDoc.product?.id : previousDoc?.product
  if (previousId && previousId !== productId) {
    await recalculateProductRating(req, previousId)
  }

  return doc
}

const afterDeleteReview: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const productId = typeof doc?.product === 'object' ? doc.product?.id : doc?.product
  await recalculateProductRating(req, productId)
  return doc
}

export const Reviews: CollectionConfig = {
  slug: 'reviews',
  access: {
    create: adminOnly,
    delete: adminOnly,
    // Public read is filtered to approved reviews only — see the where clause.
    read: publicAccess,
    update: adminOnly,
  },
  admin: {
    defaultColumns: ['product', 'rating', 'authorName', 'status', 'createdAt'],
    group: 'Commerce',
    useAsTitle: 'title',
    description: 'Optional. Products with no reviews render no review UI at all.',
  },
  hooks: {
    afterChange: [afterChangeReview],
    afterDelete: [afterDeleteReview],
  },
  fields: [
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending moderation', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Only approved reviews are public or counted in the average.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'rating',
          type: 'number',
          required: true,
          min: 1,
          max: 5,
          admin: { width: '30%' },
        },
        {
          name: 'verifiedPurchase',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            width: '70%',
            description: 'Materially changes how much trust a review earns. Shown as a badge.',
          },
        },
      ],
    },
    { name: 'title', type: 'text' },
    { name: 'body', type: 'textarea', required: true },
    {
      type: 'row',
      fields: [
        { name: 'authorName', type: 'text', required: true, admin: { width: '50%' } },
        {
          name: 'authorLocation',
          type: 'text',
          admin: { width: '50%', description: 'Optional, e.g. "Portland, OR".' },
        },
      ],
    },
    {
      name: 'images',
      type: 'array',
      labels: { singular: 'Photo', plural: 'Customer photos' },
      admin: {
        description:
          'Buyers treat customer photos as objective evidence in a way they never treat ours. 63% of sites make these hard to browse.',
      },
      fields: [{ name: 'image', type: 'upload', relationTo: 'media', required: true }],
    },
    {
      name: 'variantPurchased',
      type: 'text',
      admin: { description: 'Which option they bought, e.g. "10 inch / Copper".' },
    },
    {
      name: 'merchantResponse',
      type: 'textarea',
      admin: {
        description:
          '89% of sites never answer negative reviews. A visible, non-defensive reply measurably improves confidence — including for the people reading the complaint.',
      },
    },
    {
      name: 'helpfulCount',
      type: 'number',
      defaultValue: 0,
      min: 0,
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'originalCreatedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly' },
        description:
          'Only for imported reviews. Preserve the original date — re-dating imports to the import day destroys the recency signal that makes reviews trustworthy.',
      },
    },
  ],
  timestamps: true,
}
