import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { AdminBar } from '@/components/AdminBar'
import { ConsentBanner } from '@/components/Analytics/ConsentBanner'
import { ConsentDefault } from '@/components/Analytics/ConsentDefault'
import { GoogleAnalytics } from '@/components/Analytics/GoogleAnalytics'
import { GoogleTagManagerHead, GoogleTagManagerNoScript } from '@/components/Analytics/GoogleTagManager'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { Providers } from '@/providers'
import { InitTheme } from '@/providers/Theme/InitTheme'
import { fontVariables } from '@/fonts'
import { ThemeTokens } from '@/components/ThemeTokens'
import { companyName, getCompany } from '@/utilities/getCompany'
import { getServerSideURL } from '@/utilities/getURL'
import { compactJsonLd, jsonLdScript } from '@/utilities/jsonLd'
import React from 'react'
import './globals.css'

const mediaUrl = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const url = (value as { url?: string | null }).url
  if (!url) return undefined
  return url.startsWith('http') ? url : `${getServerSideURL()}${url}`
}

/**
 * Sitewide metadata from the Company global — the single source of shop
 * identity. Never env vars, never constants: that is how a template ships
 * with the previous client's name in every <title> (the commented-out
 * SITE_NAME block this replaces was exactly that pattern).
 *
 * Pages contribute their own title into the template and may override any
 * field; this layer guarantees no route ever renders brandless or with a
 * localhost metadataBase.
 */
export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompany()
  const name = companyName(company)
  const baseUrl = getServerSideURL()
  const ogImage = mediaUrl(company.ogImage)
  const iconUrl = mediaUrl(company.logoMark)
  // The image optimizer rejects absolute url params (treated as remote and
  // not in remotePatterns) — it needs the site-relative media path.
  const iconPath = iconUrl?.startsWith(baseUrl) ? iconUrl.slice(baseUrl.length) : iconUrl

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: name,
      template: `%s | ${name}`,
    },
    ...(company.tagline ? { description: company.tagline } : {}),
    robots: { index: true, follow: true },
    openGraph: {
      siteName: name,
      type: 'website',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: { card: 'summary_large_image' },
    // The admin's logo mark IS the favicon. The stock icon lives in
    // public/favicon.ico, which browsers only fetch implicitly when a page
    // declares no <link rel="icon"> at all — so it is purely the fallback
    // for a shop that has not uploaded a mark. It must NOT be an app/
    // favicon.ico file: that convention injects its own 48x48 link tag
    // alongside this one, and for a ~32px tab slot browsers pick the closer
    // size — the stock icon beat the store logo on every tab. The 32px
    // optimizer variant exists for the same reason (q=90: the only
    // non-default quality next.config allows).
    ...(iconUrl
      ? {
          icons: {
            icon: [
              {
                url: `/_next/image?url=${encodeURIComponent(iconPath ?? '')}&w=32&q=90`,
                sizes: '32x32',
                type: 'image/png',
              },
              { url: iconUrl, sizes: '512x512', type: 'image/png' },
            ],
            apple: [{ url: iconUrl, sizes: '512x512', type: 'image/png' }],
          },
        }
      : {}),
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const company = await getCompany()
  const baseUrl = getServerSideURL()
  const name = companyName(company)

  // Organization: the machine-readable "who runs this shop" — what search
  // engines and answer engines use to tie the domain to an entity. Empty
  // Company fields are omitted entirely (a fresh shop emits a minimal but
  // valid block, never hollow properties).
  const organizationJsonLd = compactJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    ...(company.legalName?.trim() ? { legalName: company.legalName.trim() } : {}),
    url: baseUrl,
    logo: mediaUrl(company.logoMark) ?? mediaUrl(company.logoLight),
    email: company.supportEmail || company.email || undefined,
    telephone: company.phone || undefined,
    address: company.addressLine1?.trim()
      ? compactJsonLd({
          '@type': 'PostalAddress',
          streetAddress: [company.addressLine1, company.addressLine2]
            .filter(Boolean)
            .join(', '),
          addressLocality: company.city ?? undefined,
          addressRegion: company.region ?? undefined,
          postalCode: company.postalCode ?? undefined,
          addressCountry: company.country ?? undefined,
        })
      : undefined,
    sameAs: (company.socialLinks ?? [])
      .map((link) => link?.url)
      .filter((url): url is string => Boolean(url)),
  })

  const webSiteJsonLd = compactJsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: baseUrl,
  })

  return (
    <html
      className={fontVariables}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        {/* Consent default must be the first script in <head> — GTM's
            container script starts evaluating tags almost immediately, and
            both it and GA4's gtag.js library need the consent state on the
            dataLayer before they load, not after. */}
        <ConsentDefault />
        <GoogleTagManagerHead />
        <InitTheme />
        {/* Per-shop brand tokens. Renders after the stylesheet so it overrides
            the defaults in globals.css, and runs per request so a palette
            change in the admin takes effect without a rebuild. */}
        <ThemeTokens />
        <script
          dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd) }}
          type="application/ld+json"
        />
        <script
          dangerouslySetInnerHTML={{ __html: jsonLdScript(webSiteJsonLd) }}
          type="application/ld+json"
        />
      </head>
      {/* Browser extensions (password managers, Grammarly, Dark Reader) inject
          attributes into <body> before React hydrates, which reports as a
          hydration mismatch in dev. This suppresses that for <body>'s own
          attributes only — descendants are still checked normally, so real
          mismatches are not hidden. */}
      <body suppressHydrationWarning>
        {/* Google's own install instructions: immediately after the opening
            <body> tag. */}
        <GoogleTagManagerNoScript />
        <GoogleAnalytics />
        <ConsentBanner />
        <Providers>
          <AdminBar />
          <LivePreviewListener />

          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
