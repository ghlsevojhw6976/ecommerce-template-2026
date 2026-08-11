import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'

import { buildFeed } from '@/lib/merchant/buildFeed'
import type { MerchantMarket } from '@/lib/merchant/types'
import { getServerSideURL } from '@/utilities/getURL'

/**
 * Feed-pipeline audit — runs the REAL buildFeed()/mapProduct() code (not a
 * reimplementation) against every product and checks the output for
 * internal consistency: price math, GTIN format, image/link reachability
 * shape, availability logic, and title/price/brand PARITY against the raw
 * DB fields the PDP's own JSON-LD reads (mapProduct.ts and page.tsx are
 * supposed to derive from the same fields — this verifies they still do).
 *
 * Read-only. Writes a report; changes nothing.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gmcFeedAudit.ts
 */

const FALLBACK_MARKET: MerchantMarket = { feedLabel: 'US', contentLanguage: 'en', currencyCode: 'USD' }

const GTIN_RE = /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const serverUrl = getServerSideURL()

  const settings = await payload.findGlobal({ slug: 'merchant-center', depth: 0 })
  const configured = (settings?.markets ?? []).find((m: any) => m?.active)
  const market: MerchantMarket = configured
    ? {
        feedLabel: configured.feedLabel,
        contentLanguage: configured.contentLanguage,
        currencyCode: configured.currencyCode,
      }
    : FALLBACK_MARKET

  console.log('Market in use:', JSON.stringify(market))
  console.log('Configured markets on the global:', JSON.stringify(settings?.markets ?? []))

  const report = await buildFeed({ payload, market, serverUrl })

  console.log('counts:', JSON.stringify(report.counts))
  console.log('skippedByReason:', JSON.stringify(report.skippedByReason, null, 2))

  // --- Cross-checks on every INCLUDED product ---
  const issues: Record<string, unknown>[] = []

  // Need raw DB docs to compare against (buildFeed already fetched depth:1,
  // but re-fetch by id here for a clean, independent comparison).
  const byOfferId = new Map(report.inputs.map((i) => [i.offerId, i]))
  const { docs } = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 1000,
    where: { _status: { equals: 'published' } },
  })

  for (const p of docs as any[]) {
    const offerId = p.slug || String(p.id)
    const mapped = byOfferId.get(offerId)
    if (!mapped) continue // not included — already covered by skip reasons
    const attrs = mapped.productAttributes

    // 1. Title parity
    if (attrs.title !== p.title) {
      issues.push({ category: 'title-mismatch', id: p.id, offerId, feedTitle: attrs.title, dbTitle: p.title })
    }

    // 2. Price math: amountMicros should be exactly priceInUSD (or compareAt on sale) * 10000
    const expectedBaseMicros = String(Math.round((p.compareAtPriceInUSD ?? p.priceInUSD) * 10_000))
    if (!attrs.salePrice && String(attrs.price.amountMicros) !== String(Math.round(p.priceInUSD * 10_000))) {
      issues.push({
        category: 'price-micros-mismatch',
        id: p.id,
        offerId,
        priceInUSD: p.priceInUSD,
        feedAmountMicros: attrs.price.amountMicros,
      })
    }
    if (attrs.salePrice) {
      const expectedSale = String(Math.round(p.priceInUSD * 10_000))
      if (String(attrs.salePrice.amountMicros) !== expectedSale) {
        issues.push({
          category: 'sale-price-micros-mismatch',
          id: p.id,
          offerId,
          priceInUSD: p.priceInUSD,
          feedSaleMicros: attrs.salePrice.amountMicros,
        })
      }
      if (String(attrs.price.amountMicros) !== String(Math.round((p.compareAtPriceInUSD ?? 0) * 10_000))) {
        issues.push({
          category: 'was-price-micros-mismatch',
          id: p.id,
          offerId,
          compareAtPriceInUSD: p.compareAtPriceInUSD,
          feedPriceMicros: attrs.price.amountMicros,
        })
      }
    }

    // 3. Link must point at /products/<slug> on our own domain
    const expectedLink = `${serverUrl}/products/${p.slug ?? ''}`
    if (attrs.link !== expectedLink) {
      issues.push({ category: 'link-mismatch', id: p.id, offerId, feedLink: attrs.link, expectedLink })
    }

    // 4. Image link must be an absolute URL
    if (attrs.imageLink && !/^https?:\/\//.test(attrs.imageLink)) {
      issues.push({ category: 'image-link-not-absolute', id: p.id, offerId, imageLink: attrs.imageLink })
    }

    // 5. GTIN format (only if one is set)
    if (p.gtin && !GTIN_RE.test(String(p.gtin).trim())) {
      issues.push({ category: 'gtin-invalid-format', id: p.id, offerId, gtin: p.gtin })
    }

    // 6. Brand parity
    if ((p.brand ?? undefined) !== attrs.brand) {
      issues.push({ category: 'brand-mismatch', id: p.id, offerId, feedBrand: attrs.brand, dbBrand: p.brand })
    }

    // 7. Availability logic sanity
    const supplier = typeof p.supplier === 'object' ? p.supplier : null
    const expectedAvailability =
      p.fulfilment === 'dropship'
        ? supplier?.status === 'paused'
          ? 'out_of_stock'
          : 'in_stock'
        : (typeof p.inventory === 'number' ? p.inventory : 0) > 0
          ? 'in_stock'
          : 'out_of_stock'
    if (attrs.availability !== expectedAvailability) {
      issues.push({
        category: 'availability-mismatch',
        id: p.id,
        offerId,
        feedAvailability: attrs.availability,
        expected: expectedAvailability,
        inventory: p.inventory,
        fulfilment: p.fulfilment,
      })
    }

    // 8. itemGroupId format re-check (Google's own rule, defence in depth)
    if (attrs.itemGroupId && !/^[A-Za-z0-9_-]{1,50}$/.test(attrs.itemGroupId)) {
      issues.push({ category: 'itemGroupId-invalid', id: p.id, offerId, itemGroupId: attrs.itemGroupId })
    }

    // 9. Description present? (not required, but flag total absence at scale)
    if (!attrs.description) {
      issues.push({ category: 'no-feed-description', id: p.id, offerId })
    }
  }

  // --- itemGroupId family sanity across the WHOLE feed: every member of a
  // family should share brand + googleProductCategory (a family that's
  // actually two different products masquerading as variants).
  const families = new Map<string, { offerId: string; brand?: string; category?: string; title: string }[]>()
  for (const input of report.inputs) {
    const gid = input.productAttributes.itemGroupId
    if (!gid) continue
    if (!families.has(gid)) families.set(gid, [])
    families.get(gid)!.push({
      offerId: input.offerId,
      brand: input.productAttributes.brand,
      category: input.productAttributes.googleProductCategory,
      title: input.productAttributes.title,
    })
  }
  for (const [gid, members] of families) {
    if (members.length < 2) continue
    const brands = new Set(members.map((m) => m.brand ?? ''))
    if (brands.size > 1) {
      issues.push({ category: 'family-brand-mismatch', itemGroupId: gid, members })
    }
  }

  fs.writeFileSync(
    '/tmp/gmc-feed-audit.json',
    JSON.stringify(
      {
        market,
        counts: report.counts,
        skippedByReason: report.skippedByReason,
        skippedProducts: report.skippedProducts,
        warnings: report.warnings,
        issues,
      },
      null,
      2,
    ),
  )

  console.log(`\n${issues.length} feed-consistency issues found. Full report: /tmp/gmc-feed-audit.json`)
  const byCategory: Record<string, number> = {}
  for (const i of issues) {
    const c = (i as any).category
    byCategory[c] = (byCategory[c] || 0) + 1
  }
  console.log(JSON.stringify(byCategory, null, 2))
  process.exit(0)
}

run()
