import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

/**
 * The feedEligible guard is the single thing standing between an affiliate
 * product and a Google Merchant Center policy violation. Google forbids
 * promoting affiliate links in Shopping; feeding one risks account-level
 * misrepresentation enforcement, which would take our direct products down too.
 *
 * So this is not a nice-to-have test — it protects the whole account.
 * See docs/decisions/2026-07-27-affiliate-products-merchant-center.md
 */

let payload: Payload
const created: number[] = []

const makeProduct = async (
  p: Payload,
  data: Record<string, unknown>,
): Promise<Record<string, any>> => {
  const doc = await p.create({
    collection: 'products',
    data: {
      title: `test-${Math.random().toString(36).slice(2, 10)}`,
      ...data,
    } as any,
  })
  created.push(doc.id as number)
  return doc as Record<string, any>
}

describe('Merchant Center feed eligibility', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  afterAll(async () => {
    for (const id of created) {
      await payload.delete({ collection: 'products', id }).catch(() => {})
    }
  })

  it('marks a direct product as feed eligible', async () => {
    const doc = await makeProduct(payload, { fulfilment: 'direct' })
    expect(doc.feedEligible).toBe(true)
  })

  it('marks a dropship product as feed eligible — we are merchant of record', async () => {
    const doc = await makeProduct(payload, { fulfilment: 'dropship' })
    expect(doc.feedEligible).toBe(true)
  })

  it('marks an affiliate product as NOT feed eligible', async () => {
    const doc = await makeProduct(payload, {
      fulfilment: 'affiliate',
      affiliateUrl: 'https://partner.example.com/product/123',
    })
    expect(doc.feedEligible).toBe(false)
  })

  it('refuses to let feedEligible be forced true on an affiliate product', async () => {
    // The dangerous case: someone (or some import script) sets the flag directly.
    const doc = await makeProduct(payload, {
      fulfilment: 'affiliate',
      feedEligible: true,
      affiliateUrl: 'https://partner.example.com/product/456',
    })
    expect(doc.feedEligible).toBe(false)
  })

  it('revokes eligibility when a product is switched to affiliate', async () => {
    const doc = await makeProduct(payload, { fulfilment: 'direct' })
    expect(doc.feedEligible).toBe(true)

    const updated = await payload.update({
      collection: 'products',
      id: doc.id,
      data: { fulfilment: 'affiliate' } as any,
    })
    expect((updated as Record<string, any>).feedEligible).toBe(false)
  })

  it('restores eligibility when an affiliate product becomes dropship', async () => {
    // The commercial upgrade path: partner product becomes one we sell.
    const doc = await makeProduct(payload, { fulfilment: 'affiliate' })
    expect(doc.feedEligible).toBe(false)

    const updated = await payload.update({
      collection: 'products',
      id: doc.id,
      data: { fulfilment: 'dropship' } as any,
    })
    expect((updated as Record<string, any>).feedEligible).toBe(true)
  })
})
