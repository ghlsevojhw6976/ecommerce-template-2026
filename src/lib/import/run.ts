import type { Payload } from 'payload'

import { readCsv } from './csv'
import { importImages, type MediaCache } from './media'
import { mapRow, parseReviewDate, type MappedRow } from './mapRow'

/**
 * Product import — ONE PRODUCT PER CSV ROW.
 *
 * Rows sharing an item_group_id become SIBLING PRODUCTS linked by
 * `itemGroupId`, not variants of one product. This is the Amazon model the
 * shop uses (the option selector navigates between sibling pages) and the
 * model Google's feed spec mandates: one offer per variant, each with its own
 * id, link, image and GTIN, grouped by item_group_id.
 *
 * An earlier version collapsed groups into one product with plugin variants.
 * That silently discarded every sibling's own GTIN, title, images and copy
 * (the variants table cannot hold them), dropped ~20 rows whose option combos
 * collapsed under axis intersection, and left the parent products priceless —
 * which excluded them from the feed entirely.
 *
 * Idempotent: keyed on the product slug (which embeds the source ASIN), so a
 * re-run updates rather than duplicates. Safe to interrupt and resume.
 * A formerly-bundled product matched by slug is converted in place: variants
 * deleted, enableVariants off, own price restored.
 *
 * Images are downloaded to our own storage — see media.ts for why hotlinking
 * the supplier CDN is not an option.
 */

export type ImportOptions = {
  payload: Payload
  csvPath: string
  /** Images fetched per product. The source averages 8. */
  imagesPerProduct?: number
  /** Stop after N groups — for a smoke test. */
  limit?: number
  importReviews?: boolean
  onProgress?: (message: string) => void
}

export type ImportReport = {
  productsCreated: number
  productsUpdated: number
  /** Bundled-era variant rows deleted while converting products in place. */
  variantsDeleted: number
  reviewsCreated: number
  /** Reviews skipped because an identical one exists on a sibling (pooled display). */
  duplicateReviewsSkipped: number
  imagesImported: number
  categoriesCreated: number
  /** GTIN-14s identifying a case/pallet rather than a retail unit. */
  caseLevelGtins: { slug: string; gtin: string }[]
  /** Rows dropped as duplicate supplier listings (same group, same options). */
  duplicateListingsSkipped: { groupId: string; label: string; prices: number[] }[]
  productsWithoutPrice: string[]
  errors: { slug: string; error: string }[]
}

const rich = (text: string) => ({
  root: {
    type: 'root' as const,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1,
    children: text
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((paragraph) => ({
        type: 'paragraph' as const,
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        textFormat: 0,
        version: 1,
        children: [
          {
            type: 'text' as const,
            detail: 0,
            format: 0,
            mode: 'normal' as const,
            style: '',
            text: paragraph.trim(),
            version: 1,
          },
        ],
      })),
  },
})

/** Finds or creates a category, returning its id. */
const ensureCategory = async (
  payload: Payload,
  title: string,
  parentId: number | string | null,
  created: { count: number },
): Promise<number | string | null> => {
  if (!title.trim()) return null

  // Look up by title GLOBALLY, not scoped by parent.
  //
  // Category slugs are unique across the whole collection, so a parent-scoped
  // lookup misses a category that already exists elsewhere in the tree and then
  // tries to create a duplicate slug. In this feed "Small Appliances" appears
  // both as a top-level category and as a leaf under Home & Kitchen — the
  // scoped lookup failed on the second one and took the whole product group
  // down with it, reporting a misleading "product slug" error.
  //
  // Reusing the existing category is also the correct behaviour: one name
  // should mean one category, not two in different branches.
  const existing = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1,
    where: { title: { equals: title } },
  })

  if (existing.docs[0]) return existing.docs[0].id

  const doc = await payload.create({
    collection: 'categories',
    data: { title, ...(parentId ? { parent: parentId } : {}), showInNav: true } as never,
  })
  created.count++
  return doc.id
}

export const runImport = async ({
  payload,
  csvPath,
  imagesPerProduct = 8,
  limit,
  importReviews = true,
  onProgress = () => {},
}: ImportOptions): Promise<ImportReport> => {
  const table = readCsv(csvPath)
  const mapped = table.rows.map((row) => mapRow(table, row))

  const report: ImportReport = {
    productsCreated: 0,
    productsUpdated: 0,
    variantsDeleted: 0,
    reviewsCreated: 0,
    duplicateReviewsSkipped: 0,
    imagesImported: 0,
    categoriesCreated: 0,
    caseLevelGtins: [],
    duplicateListingsSkipped: [],
    productsWithoutPrice: [],
    errors: [],
  }

  // ---- group by item_group_id -------------------------------------------
  // Groups still matter — for the shared itemGroupId, for de-duplicating
  // repeated supplier listings, and for pooling reviews — but every surviving
  // row becomes its OWN product.
  const groups = new Map<string, MappedRow[]>()
  for (const row of mapped) {
    const key = row.groupId || row.asin
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const mediaCache: MediaCache = new Map()
  const categoryCreated = { count: 0 }

  let processed = 0

  for (const [groupId, rowsInGroup] of groups) {
    if (limit && processed >= limit) break
    processed++

    // ---- de-duplicate supplier listings ---------------------------------
    // Some groups repeat the same option combination at different prices —
    // duplicate listings of the same physical item, not genuine siblings.
    // Keeping both would publish near-identical pages at two prices; keep
    // the cheapest. Rows with DISTINCT options all survive — that is the
    // point of the sibling model.
    const byOptions = new Map<string, MappedRow[]>()
    for (const row of rowsInGroup) {
      const key = row.variantAxes.map((a) => `${a.type}=${a.value}`).sort().join('|')
      byOptions.set(key, [...(byOptions.get(key) ?? []), row])
    }

    const uniqueRows: MappedRow[] = []
    for (const [key, candidates] of byOptions) {
      if (candidates.length > 1) {
        report.duplicateListingsSkipped.push({
          groupId,
          label: key || '(no options)',
          prices: candidates.map((c) => (c.priceCents ?? 0) / 100),
        })
      }
      const cheapest = [...candidates].sort(
        (a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity),
      )[0]!
      uniqueRows.push(cheapest)
    }

    const isFamily = uniqueRows.length > 1
    // Google: 1-50 chars, alphanumeric/underscore/dash, case-insensitive.
    const itemGroupId = isFamily
      ? groupId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 50)
      : undefined

    // Review content already seeded onto an earlier sibling in THIS family —
    // 18 of 27 groups ship byte-identical reviews_json on every row, and the
    // storefront pools reviews across the family, so seeding them onto each
    // sibling would show every review N times.
    const seededReviewKeys = new Set<string>()

    for (const row of uniqueRows) {
      try {
        if (!row.priceCents) report.productsWithoutPrice.push(row.slug)
        if (row.gtin && !row.gtinIsRetailUnit) {
          report.caseLevelGtins.push({ slug: row.slug, gtin: row.gtin })
        }

        // ---- categories -------------------------------------------------
        const parentId = await ensureCategory(payload, row.categoryL1, null, categoryCreated)
        const leafId =
          row.categoryLeaf && row.categoryLeaf !== row.categoryL1
            ? await ensureCategory(payload, row.categoryLeaf, parentId, categoryCreated)
            : null
        const categoryIds = [leafId ?? parentId].filter(Boolean) as (number | string)[]

        // ---- images — THIS row's own, not a shared lead's ---------------
        const imageIds = await importImages({
          payload,
          urls: row.imageUrls,
          alt: row.title,
          cache: mediaCache,
          limit: imagesPerProduct,
        })
        report.imagesImported += imageIds.length

        // ---- feed attributes from the row's axes ------------------------
        const colorAxis = row.variantAxes.find((a) => /colou?r/i.test(a.type))
        const sizeAxis = row.variantAxes.find((a) => /size|capacity/i.test(a.type))

        // ---- product ----------------------------------------------------
        const data = {
          title: row.title,
          slug: row.slug,
          _status: 'published',
          brand: row.brand,
          condition: 'new',
          fulfilment: 'direct',
          ...(row.gtin ? { gtin: row.gtin } : {}),
          ...(row.mpn ? { mpn: row.mpn } : {}),
          ...(row.googleProductCategory
            ? { googleProductCategory: row.googleProductCategory }
            : {}),
          ...(categoryIds.length ? { categories: categoryIds } : {}),
          ...(imageIds.length ? { gallery: imageIds.map((image) => ({ image })) } : {}),
          shortDescription: row.shortDescription,
          ...(row.descriptionText ? { description: rich(row.descriptionText) } : {}),
          keyFeatures: row.keyFeatures,
          specifications: row.specifications,
          ...(row.weightGrams ? { weightGrams: row.weightGrams } : {}),
          // Sibling-family linkage — replaces the bundled-variant model.
          itemGroupId: itemGroupId ?? null,
          variantLabel: isFamily ? row.variantLabel || null : null,
          color: colorAxis?.value ?? null,
          size: sizeAxis?.value ?? null,
          // Every product owns its price now. The bundled model left variant
          // parents priceless, which silently excluded them from the feed.
          enableVariants: false,
          priceInUSDEnabled: true,
          priceInUSD: row.priceCents ?? 0,
          inventory: row.inventory,
        } as never

        const existing = await payload.find({
          collection: 'products',
          depth: 0,
          limit: 1,
          where: { slug: { equals: row.slug } },
        })

        const product = existing.docs[0]
          ? await payload.update({
              collection: 'products',
              id: existing.docs[0].id,
              data,
              context: { disableRevalidate: true },
            })
          : await payload.create({
              collection: 'products',
              data,
              context: { disableRevalidate: true },
            })

        if (existing.docs[0]) report.productsUpdated++
        else report.productsCreated++

        // ---- clear bundled-era variants ---------------------------------
        // A formerly-bundled product converted in place must not keep its
        // variant rows: the storefront no longer reads them, but the plugin
        // would still validate carts against them.
        const stale = await payload.find({
          collection: 'variants',
          depth: 0,
          limit: 0,
          pagination: false,
          where: { product: { equals: product.id } },
        })

        for (const variant of stale.docs) {
          await payload.delete({ collection: 'variants', id: variant.id }).catch(() => undefined)
          report.variantsDeleted++
        }

        // ---- reviews — deduplicated across the family -------------------
        if (importReviews && row.reviews.length) {
          const already = await payload.find({
            collection: 'reviews',
            depth: 0,
            limit: 1,
            where: { product: { equals: product.id } },
          })

          if (!already.totalDocs) {
            for (const source of row.reviews.slice(0, 40)) {
              const body = source.content?.trim()
              const rating = Number(source.rating)
              if (!body || !Number.isFinite(rating) || rating < 1 || rating > 5) continue

              // Same author + title + body seen on a sibling in this run =
              // the same review syndicated across listings. One copy pools
              // to every family page; duplicates would multiply it.
              const reviewKey = `${source.author ?? ''}::${source.title ?? ''}::${body}`
              if (seededReviewKeys.has(reviewKey)) {
                report.duplicateReviewsSkipped++
                continue
              }
              seededReviewKeys.add(reviewKey)

              await payload.create({
                collection: 'reviews',
                data: {
                  product: product.id,
                  status: 'approved',
                  rating: Math.round(rating),
                  title: source.title?.trim() || undefined,
                  body,
                  authorName: source.author?.trim() || 'Verified buyer',
                  verifiedPurchase: Boolean(source.is_verified),
                  helpfulCount: Number(source.helpful_count) || 0,
                  // Preserve the original date — re-dating imported reviews to
                  // the import day destroys the recency signal entirely.
                  ...(parseReviewDate(source.timestamp)
                    ? { originalCreatedAt: parseReviewDate(source.timestamp) }
                    : {}),
                } as never,
              })
              report.reviewsCreated++
            }
          }
        }
      } catch (error) {
        // Payload's top-level message ("field is invalid: x") often names the
        // wrong field — the useful detail is in `data.errors`.
        const detail = (error as { data?: { errors?: { path?: string; message?: string }[] } })
          ?.data?.errors
        const message = error instanceof Error ? error.message : String(error)

        report.errors.push({
          slug: row.slug,
          error: detail?.length
            ? `${message} :: ${detail.map((e) => `${e.path}=${e.message}`).join('; ')}`
            : message,
        })
      }
    }

    if (processed % 10 === 0) {
      onProgress(
        `${processed}/${groups.size} groups · ${report.productsCreated + report.productsUpdated} products · ${report.imagesImported} images · ${report.reviewsCreated} reviews`,
      )
    }
  }

  report.categoriesCreated = categoryCreated.count
  return report
}
