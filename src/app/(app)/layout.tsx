import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { AdminBar } from '@/components/AdminBar'
import { GoogleAnalytics } from '@/components/Analytics/GoogleAnalytics'
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
    // The admin's logo mark doubles as the favicon; the bundled favicon.ico
    // is only the fallback for a shop that has not uploaded one. Both links
    // render (the .ico comes from the app/favicon.ico file convention) —
    // declaring size + type here is what makes browsers prefer this one.
    ...(iconUrl
      ? { icons: { icon: [{ url: iconUrl, sizes: '512x512', type: 'image/png' }] } }
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
        <GoogleAnalytics />
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
