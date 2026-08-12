import type { Media, Product } from '@/payload-types'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { FamilySelector, getFamily } from '@/components/product/FamilySelector'
import { Gallery } from '@/components/product/Gallery'
import { ProductDescription } from '@/components/product/ProductDescription'
import { ProductGridItem } from '@/components/ProductGridItem'
import { Reviews } from '@/components/product/Reviews'
import { TrackViewItem } from '@/components/Analytics/TrackViewItem'
import { gaItem } from '@/lib/analytics/items'
import { getAlternatives } from '@/lib/commerce/recommendations'
import { getDiscount } from '@/lib/commerce/discount'
import { shippingCostCents } from '@/lib/commerce/shipping'
import { companyName, getCompany } from '@/utilities/getCompany'
import { getServerSideURL } from '@/utilities/getURL'
import { jsonLdScript } from '@/utilities/jsonLd'
import { ShippingDisclaimer } from '@/components/ShippingDisclaimer'
import { Specifications } from '@/components/product/Specifications'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { draftMode } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React, { Suspense } from 'react'
import { Metadata } from 'next'

type Args = {
  params: Promise<{
    slug: string
  }>
}

// Static, Shopify-style: every published PDP is prerendered and served from
// cache, purged on edit by revalidateProduct (src/hooks/revalidateStorefront)
// and at fulfilment when stock decrements. The hourly fallback catches
// cross-product effects (e.g. a "More to consider" row whose members changed).
export const revalidate = 3600

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const products = await payload.find({
    collection: 'products',
    depth: 0,
    draft: false,
    limit: 0,
    overrideAccess: false,
    pagination: false,
    select: { slug: true },
    where: { _status: { equals: 'published' } },
  })

  return products.docs
    .filter((product) => product.slug)
    .map((product) => ({ slug: product.slug as string }))
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const product = await queryProductBySlug({ slug })

  if (!product) return notFound()

  const gallery = product.gallery?.filter((item) => typeof item.image === 'object') || []

  const metaImage = typeof product.meta?.image === 'object' ? product.meta?.image : undefined
  const canIndex = product._status === 'published'

  const seoImage = metaImage || (gallery.length ? (gallery[0]?.image as Media) : undefined)

  const title = product.meta?.title || product.title
  // Template contract: catalogues arrive with zero hand-written meta, so the
  // description must fall back to content the import DID provide.
  const description = product.meta?.description || product.shortDescription || undefined
  const canonical = `/products/${product.slug}`

  return {
    ...(description ? { description } : {}),
    alternates: { canonical },
    openGraph: {
      title,
      ...(description ? { description } : {}),
      siteName: companyName(await getCompany()),
      url: canonical,
      // Relative URL, resolved by the layout's metadataBase — never
      // interpolate env vars into image URLs.
      ...(seoImage?.url
        ? {
            images: [
              {
                alt: seoImage.alt ?? product.title,
                ...(seoImage.height ? { height: seoImage.height } : {}),
                url: seoImage.url,
                ...(seoImage.width ? { width: seoImage.width } : {}),
              },
            ],
          }
        : {}),
    },
    robots: {
      follow: canIndex,
      googleBot: {
        follow: canIndex,
        index: canIndex,
      },
      index: canIndex,
    },
    title,
  }
}

export default async function ProductPage({ params }: Args) {
  const { slug } = await params
  const product = await queryProductBySlug({ slug })

  if (!product) return notFound()

  const gallery =
    product.gallery
      ?.filter((item) => typeof item.image === 'object')
      .map((item) => ({
        ...item,
        image: item.image as Media,
      })) || []

  const metaImage = typeof product.meta?.image === 'object' ? product.meta?.image : undefined
  const hasStock = (product.inventory ?? 0) > 0
  const price = product.priceInUSD
  const discount = getDiscount(product)

  // Colour/size siblings sharing this product's itemGroupId — powers the
  // navigating selector, the pooled review figures and the ProductGroup
  // structured data.
  const family = await getFamily(product)
  const familyIds = family.map((sibling) => sibling.id)

  // Ratings pooled across the family (Baymard: showing 9 reviews on the blue
  // page when the family has 40 is a severe failure). Weighted by count.
  const pooled = family.reduce(
    (acc, sibling) => {
      const count = (sibling as { ratingCount?: number | null }).ratingCount ?? 0
      const average = (sibling as { ratingAverage?: number | null }).ratingAverage ?? 0
      return { count: acc.count + count, weighted: acc.weighted + average * count }
    },
    { count: 0, weighted: 0 },
  )
  const pooledRating =
    family.length > 1 && pooled.count > 0
      ? { average: Math.round((pooled.weighted / pooled.count) * 10) / 10, count: pooled.count }
      : undefined

  const baseUrl = getServerSideURL()
  const absoluteMedia = (url: string | null | undefined): string | undefined =>
    url ? (url.startsWith('http') ? url : `${baseUrl}${url}`) : undefined

  const company = await getCompany()
  // Sitewide kill switch (Settings → Company → Policies) — gates the review
  // list (Reviews.tsx self-checks), the star rating shown next to the H1,
  // and aggregateRating in this page's own structured data. A rating badge
  // with no review list behind it reads worse than neither.
  const reviewsEnabled = company.reviewsEnabled !== false

  // `image` is REQUIRED for merchant-listing rich results — without it the
  // whole block is ineligible. Meta image first, then the entire gallery.
  const jsonLdImages = [
    absoluteMedia(metaImage?.url),
    ...gallery.map((item) => absoluteMedia(item.image?.url)),
  ].filter((url): url is string => Boolean(url))

  // Rating: pooled across the family when one exists; a solo product (the
  // 90% case — getFamily returns [] without an itemGroupId) uses its own
  // aggregate. Gating stars on family membership silently dropped them for
  // 344 of 382 products.
  const rating = reviewsEnabled
    ? (pooledRating ??
      (typeof product.ratingAverage === 'number' && (product.ratingCount ?? 0) > 0
        ? { average: product.ratingAverage, count: product.ratingCount! }
        : undefined))
    : undefined

  const conditionUrl = {
    new: 'https://schema.org/NewCondition',
    refurbished: 'https://schema.org/RefurbishedCondition',
    used: 'https://schema.org/UsedCondition',
  }[product.condition ?? 'new']

  const productJsonLd = {
    name: product.title,
    '@context': 'https://schema.org',
    '@type': 'Product',
    description: product.shortDescription || undefined,
    image: jsonLdImages.length ? jsonLdImages : undefined,
    // Identifiers mirror the Merchant feed (mapProduct.ts) — Google
    // cross-checks page schema against feed attributes, so the two must agree.
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.gtin ? { gtin: product.gtin } : {}),
    ...(product.mpn ? { mpn: product.mpn } : {}),
    sku: product.slug ?? String(product.id),
    // Multi-page variant pattern: each sibling page is its own Product with a
    // self-contained Offer at ITS price, tied to the family via
    // inProductGroupWithID — exactly Google's documented shape for variants
    // spread across pages.
    ...(product.itemGroupId ? { inProductGroupWithID: product.itemGroupId } : {}),
    ...(product.color ? { color: product.color } : {}),
    ...(product.size ? { size: product.size } : {}),
    ...(rating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: rating.average,
            reviewCount: rating.count,
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url: `${baseUrl}/products/${product.slug}`,
      availability: hasStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: conditionUrl,
      // Schema.org prices are decimal units, not minor units — and the
      // currency code is ISO 4217 uppercase.
      price: typeof price === 'number' ? (price / 100).toFixed(2) : undefined,
      priceCurrency: 'USD',
      // On sale: Google's documented shape for a strike-through price — the
      // Offer's `price` stays the CHARGED price, the was-price rides as a
      // ListPrice specification. This is what Google matches against the
      // feed's `price`/`salePrice` pair, so all three surfaces agree.
      ...(discount
        ? {
            priceSpecification: {
              '@type': 'PriceSpecification',
              priceType: 'https://schema.org/ListPrice',
              price: (discount.compareAt / 100).toFixed(2),
              priceCurrency: 'USD',
            },
            ...(discount.saleEndsAt && Date.parse(discount.saleEndsAt) > Date.now()
              ? { priceValidUntil: discount.saleEndsAt }
              : {}),
          }
        : {}),
      // Returns + shipping from the Company global — the same numbers the
      // policy pages print, so schema and prose cannot disagree. Google
      // weighs both blocks for product-snippet eligibility.
      ...(typeof company.returnWindowDays === 'number' && company.returnWindowDays > 0
        ? {
            hasMerchantReturnPolicy: {
              '@type': 'MerchantReturnPolicy',
              applicableCountry: 'US',
              returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
              merchantReturnDays: company.returnWindowDays,
              returnMethod: 'https://schema.org/ReturnByMail',
              returnFees:
                company.returnsShippingPaidBy === 'customer'
                  ? 'https://schema.org/ReturnShippingFees'
                  : 'https://schema.org/FreeReturn',
            },
          }
        : {}),
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        // Priced against THIS item's own charged price, via the same
        // lib/commerce/shipping.ts formula the visible page and checkout
        // use — structured data must not claim $0 while the page next to it
        // shows a real flat fee.
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: shippingCostCents(discount?.price ?? product.priceInUSD ?? 0, {
            freeShippingThreshold: company.freeShippingThreshold,
            flatShippingFee: company.flatShippingFee,
          }) / 100,
          currency: 'USD',
        },
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
        ...(typeof company.processingTimeDays === 'number' &&
        typeof company.deliveryMaxDays === 'number'
          ? {
              deliveryTime: {
                '@type': 'ShippingDeliveryTime',
                handlingTime: {
                  '@type': 'QuantitativeValue',
                  minValue: 0,
                  maxValue: company.processingTimeDays,
                  unitCode: 'DAY',
                },
                transitTime: {
                  '@type': 'QuantitativeValue',
                  minValue: company.deliveryMinDays ?? 1,
                  maxValue: company.deliveryMaxDays,
                  unitCode: 'DAY',
                },
              },
            }
          : {}),
      },
    },
  }

  // Breadcrumb trail: Home > (parent >) category > product. The visible nav
  // and the BreadcrumbList block are built from the same array so they can
  // never tell different stories.
  const leafCategory =
    Array.isArray(product.categories) && typeof product.categories[0] === 'object'
      ? (product.categories[0] as { title?: string; slug?: string; parent?: unknown })
      : undefined
  const parentCategory =
    leafCategory?.parent && typeof leafCategory.parent === 'object'
      ? (leafCategory.parent as { title?: string; slug?: string })
      : undefined

  const breadcrumbs: { name: string; href: string }[] = [
    { name: 'Home', href: '/' },
    { name: 'Shop', href: '/shop' },
    ...(parentCategory?.slug && parentCategory.title
      ? [{ name: parentCategory.title, href: `/shop/${parentCategory.slug}` }]
      : []),
    ...(leafCategory?.slug && leafCategory.title
      ? [{ name: leafCategory.title, href: `/shop/${leafCategory.slug}` }]
      : []),
  ]

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      ...breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: `${baseUrl}${crumb.href === '/' ? '' : crumb.href}`,
      })),
      {
        '@type': 'ListItem',
        position: breadcrumbs.length + 1,
        name: product.title,
      },
    ],
  }

  // "More to consider" — automatic alternatives (same category with parent
  // fallback, one premium option ranked in), replaced entirely by curated
  // relatedProducts when those exist. The old hand-curated-only row had never
  // rendered once: the field was populated on zero products.
  const payloadClient = await getPayload({ config: configPromise })
  const alternatives = await getAlternatives({ payload: payloadClient, product, limit: 8 })

  return (
    <React.Fragment>
      <script
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(productJsonLd),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(breadcrumbJsonLd),
        }}
        type="application/ld+json"
      />
      {/* GA4 view_item — payload built server-side so it carries real
          price/discount data; the island only fires the event. */}
      <TrackViewItem item={gaItem(product)} />
      {/* ================================================================
          EDITORIAL — above the fold.
          Generous space and large photography earn the emotional yes. No
          card, no border, no tinted panel: at this price point the product
          should sit on the page rather than inside a box. Whitespace is the
          oldest signal of confidence.
          ================================================================ */}
      <div className="container pt-6 pb-[var(--space-section)]">
        {/* Real trail, not just a back link: category pages are path routes
            now, and the trail is both wayfinding and the visible counterpart
            of the BreadcrumbList block above. */}
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="flex flex-wrap items-center gap-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {breadcrumbs.map((crumb) => (
              <li className="flex items-center gap-1" key={crumb.href}>
                <Link className="transition-colors hover:text-foreground" href={crumb.href}>
                  {crumb.name}
                </Link>
                <span aria-hidden>/</span>
              </li>
            ))}
            <li aria-current="page" className="truncate text-foreground/70">
              {product.title}
            </li>
          </ol>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
          <div className="reveal">
            <Suspense
              fallback={<div className="relative aspect-square w-full overflow-hidden bg-muted" />}
            >
              {Boolean(gallery?.length) && <Gallery gallery={gallery} />}
            </Suspense>
          </div>

          {/* Sticky on desktop so the buy button stays reachable while the
              buyer reads — without a mobile sticky bar that covers content. */}
          <div className="reveal lg:sticky lg:top-8 lg:self-start" style={{ animationDelay: '80ms' }}>
            <ProductDescription
              familySelector={<FamilySelector family={family} product={product} />}
              pooledRating={pooledRating}
              product={product}
              reviewsEnabled={reviewsEnabled}
              shippingDisclaimer={<ShippingDisclaimer />}
              freeShippingThreshold={company.freeShippingThreshold}
              flatShippingFee={company.flatShippingFee}
            />
          </div>
        </div>
      </div>

      {/* ================================================================
          TECHNICAL — below the fold.
          Dense, precise, tabular. This is where the rational yes is earned.
          Every section self-hides when it has no data.
          ================================================================ */}
      <Specifications product={product} />

      {product.layout?.length ? <RenderBlocks blocks={product.layout} /> : <></>}

      <Reviews familyIds={familyIds} pooledRating={pooledRating} product={product} />

      {alternatives.length >= 3 ? (
        <section
          aria-labelledby="more-to-consider"
          className="container border-t border-border py-[var(--space-section)]"
        >
          {/* "More to consider", per Baymard's label research — never
              "Customers also bought": there is no behavioural data behind
              this row and the label is a factual claim. */}
          <h2 className="mb-[var(--space-block)] text-2xl md:text-3xl" id="more-to-consider">
            More to consider
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:gap-x-6 lg:grid-cols-4">
            {alternatives.map((alternative) => (
              <li key={alternative.id}>
                <ProductGridItem product={alternative} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <></>
      )}
    </React.Fragment>
  )
}

const queryProductBySlug = async ({ slug }: { slug: string }) => {
  const { isEnabled: draft } = await draftMode()

  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'products',
    depth: 3,
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: {
      and: [
        {
          slug: {
            equals: slug,
          },
        },
        ...(draft ? [] : [{ _status: { equals: 'published' } }]),
      ],
    },
  })

  return result.docs?.[0] || null
}
