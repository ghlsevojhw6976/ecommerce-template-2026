import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

/**
 * Removes the documents the frontend e2e seed creates.
 *
 * The seed only ever creates, so the second run against the same database died
 * on "Value must be unique" for the product slug — and because that happened in
 * `beforeAll`, it reported as a dozen unrelated tests failing rather than as a
 * dirty database. Running this first makes the suite repeatable.
 *
 * Scoped to the known fixture slugs rather than truncating the collections, so
 * it stays harmless if someone points it at a database with other data in it.
 */

const PRODUCT_SLUGS = ['test-product', 'test-product-variants', 'no-inventory-product']
const VARIANT_OPTION_VALUES = ['payload', 'figma']
const VARIANT_TYPE_NAME = 'brand'

export async function resetTestFixtures(): Promise<void> {
  const payload = await getPayload({ config })

  const products = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 0,
    pagination: false,
    where: { slug: { in: PRODUCT_SLUGS } },
  })

  const productIDs = products.docs.map((doc) => doc.id)

  // Variants first: they hold the reference to the product.
  if (productIDs.length) {
    await payload.delete({ collection: 'variants', where: { product: { in: productIDs } } })
    await payload.delete({ collection: 'products', where: { id: { in: productIDs } } })
  }

  await payload.delete({
    collection: 'variantOptions',
    where: { value: { in: VARIANT_OPTION_VALUES } },
  })

  await payload.delete({
    collection: 'variantTypes',
    where: { name: { equals: VARIANT_TYPE_NAME } },
  })
}
