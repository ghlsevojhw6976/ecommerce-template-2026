import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { getAlternatives, getPostPurchase } from '@/lib/commerce/recommendations'
import type { Product } from '@/payload-types'

/**
 * The recommendation engine's contract:
 *
 *  1. Curation wins — a populated relatedProducts replaces the automatic row.
 *  2. Small leaf categories fall back to the parent subtree (leaf-only fills
 *     4 slots for 65% of the catalogue; the fallback lifts it to 97%).
 *  3. The product itself and its own variant family never appear; other
 *     families appear once, not once per colourway.
 *  4. A premium (1.1–2×) alternative is ranked near the front when one
 *     exists — the upsell lives inside the row.
 */

let payload: Payload
const created: { collection: string; id: number | string }[] = []
const track = (collection: string, id: number | string) => created.push({ collection, id })

let parentCatId: number
let leafAId: number
let leafBId: number
const products: Record<string, Product> = {}

const makeProduct = async (
  key: string,
  data: Record<string, unknown>,
): Promise<Product> => {
  const doc = (await payload.create({
    collection: 'products',
    data: {
      title: `Reco ${key}`,
      slug: `reco-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      _status: 'published',
      priceInUSDEnabled: true,
      inventory: 5,
      ...data,
    } as never,
    context: { disableRevalidate: true },
  })) as Product
  track('products', doc.id)
  products[key] = doc
  return doc
}

beforeAll(async () => {
    payload = await getPayload({ config: await config })

    const parent = await payload.create({
      collection: 'categories',
      data: { title: `Reco Parent ${Date.now()}`, showInNav: false } as never,
    })
    parentCatId = parent.id as number
    track('categories', parentCatId)

    const leafA = await payload.create({
      collection: 'categories',
      data: { title: `Reco Leaf A ${Date.now()}`, parent: parentCatId, showInNav: false } as never,
    })
    leafAId = leafA.id as number
    track('categories', leafAId)

    const leafB = await payload.create({
      collection: 'categories',
      data: { title: `Reco Leaf B ${Date.now()}`, parent: parentCatId, showInNav: false } as never,
    })
    leafBId = leafB.id as number
    track('categories', leafBId)

    // Leaf A: the subject + one sibling (too small to fill a row alone).
    await makeProduct('subject', { categories: [leafAId], priceInUSD: 50000, ratingCount: 5, ratingAverage: 4 })
    await makeProduct('leafmate', { categories: [leafAId], priceInUSD: 52000, ratingCount: 20, ratingAverage: 5 })

    // Leaf B under the same parent: fallback pool, including a premium
    // candidate and a two-colour variant family.
    await makeProduct('premium', { categories: [leafBId], priceInUSD: 75000, ratingCount: 1, ratingAverage: 3 })
    await makeProduct('cheap', { categories: [leafBId], priceInUSD: 30000, ratingCount: 15, ratingAverage: 5 })
    await makeProduct('family-red', { categories: [leafBId], priceInUSD: 51000, itemGroupId: 'reco-fam', color: 'Red', ratingCount: 9, ratingAverage: 4 })
  await makeProduct('family-blue', { categories: [leafBId], priceInUSD: 51000, itemGroupId: 'reco-fam', color: 'Blue', ratingCount: 8, ratingAverage: 4 })
})

afterAll(async () => {
  for (const { collection, id } of created.reverse()) {
    await payload.delete({ collection: collection as never, id }).catch(() => {})
  }
})

describe('getAlternatives', () => {
  it('falls back to the parent subtree when the leaf cannot fill the row, never includes self, dedupes families', async () => {
    const subject = (await payload.findByID({
      collection: 'products',
      id: products.subject!.id,
      depth: 1,
    })) as Product

    const alternatives = await getAlternatives({ payload, product: subject, limit: 8 })
    const ids = alternatives.map((alternative) => String(alternative.id))

    // Fallback engaged: leaf A alone held one sibling; the row has more.
    expect(alternatives.length).toBeGreaterThanOrEqual(4)
    expect(ids).not.toContain(String(subject.id))

    // The variant family appears exactly once.
    const familyMembers = alternatives.filter((alternative) => alternative.itemGroupId === 'reco-fam')
    expect(familyMembers).toHaveLength(1)
  })

  it('ranks a premium (1.1–2×) alternative near the front — the inline upsell', async () => {
    const subject = (await payload.findByID({
      collection: 'products',
      id: products.subject!.id,
      depth: 1,
    })) as Product

    const alternatives = await getAlternatives({ payload, product: subject, limit: 8 })
    const premiumIndex = alternatives.findIndex(
      (alternative) => String(alternative.id) === String(products.premium!.id),
    )

    // $750 vs the subject's $500 = 1.5× — despite the WORST rating in the
    // pool, it must hold one of the first two slots.
    expect(premiumIndex).toBeGreaterThanOrEqual(0)
    expect(premiumIndex).toBeLessThanOrEqual(1)
  })

  it('curated relatedProducts replaces the automatic row entirely', async () => {
    await payload.update({
      collection: 'products',
      id: products.subject!.id,
      // _status is required: products are versioned, and an update without it
      // lands on the DRAFT — the published version (which the storefront and
      // this engine read) would keep an empty relatedProducts forever.
      data: { relatedProducts: [products.cheap!.id], _status: 'published' } as never,
      context: { disableRevalidate: true },
    })

    const subject = (await payload.findByID({
      collection: 'products',
      id: products.subject!.id,
      depth: 1,
    })) as Product

    const alternatives = await getAlternatives({ payload, product: subject, limit: 8 })
    expect(alternatives.map((alternative) => String(alternative.id))).toEqual([
      String(products.cheap!.id),
    ])
  })
})

describe('getPostPurchase', () => {
  it('prefers curated accessories of the purchased items and never suggests what was bought', async () => {
    const result = await getPostPurchase({
      payload,
      productIds: [products.subject!.id],
      limit: 4,
    })

    expect(result.curated).toBe(true)
    const ids = result.items.map((item) => String(item.id))
    expect(ids).toContain(String(products.cheap!.id))
    expect(ids).not.toContain(String(products.subject!.id))
  })
})
