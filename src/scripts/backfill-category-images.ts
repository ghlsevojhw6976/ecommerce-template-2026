import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Gives every category without an image the primary photo of its best-reviewed
 * product.
 *
 * Category tiles are the homepage's main browse entry point, and an unshot
 * category renders as a grey rectangle — which reads as broken rather than as
 * "photography pending". Product photography is already licensed and already
 * hosted locally, so the catalogue can illustrate itself on day one.
 *
 * This is a floor, not a ceiling: an image set by hand in the admin is left
 * alone, so a shop can replace these with proper category shots one at a time
 * without the script undoing the work on its next run.
 *
 *   pnpm backfill:category-images
 */

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })

  const categories = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 0,
    pagination: false,
  })

  let filled = 0
  let skipped = 0

  for (const category of categories.docs) {
    if (category.image) {
      skipped++
      continue
    }

    // Best-reviewed product in the category itself...
    let candidates = await payload.find({
      collection: 'products',
      depth: 1,
      limit: 1,
      sort: '-ratingCount',
      where: {
        and: [{ categories: { equals: category.id } }, { _status: { equals: 'published' } }],
      },
    })

    // ...falling back to anything filed under one of its children, because
    // parent categories usually hold no products directly.
    if (!candidates.docs.length) {
      const children = await payload.find({
        collection: 'categories',
        depth: 0,
        limit: 0,
        pagination: false,
        where: { parent: { equals: category.id } },
      })

      if (children.docs.length) {
        candidates = await payload.find({
          collection: 'products',
          depth: 1,
          limit: 1,
          sort: '-ratingCount',
          where: {
            and: [
              { categories: { in: children.docs.map((child) => child.id) } },
              { _status: { equals: 'published' } },
            ],
          },
        })
      }
    }

    const image = candidates.docs[0]?.gallery?.[0]?.image
    const imageID = image && typeof image === 'object' ? image.id : image

    if (!imageID) {
      skipped++
      continue
    }

    await payload.update({
      collection: 'categories',
      id: category.id,
      data: { image: imageID },
    })

    filled++
  }

  console.log(`Category images — filled: ${filled}, left alone: ${skipped}`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
