import Image from 'next/image'
import React from 'react'

import type { Media } from '@/payload-types'
import { LogoIcon } from '@/components/icons/logo'
import { getCompany, companyName } from '@/utilities/getCompany'
import { cn } from '@/utilities/cn'

/**
 * The shop's logo, from Company settings.
 *
 * Light and dark variants are BOTH rendered and swapped with CSS rather than
 * picked in JavaScript. Choosing in JS means the logo is either absent until
 * hydration or briefly wrong when the theme resolves — a visible flash on the
 * most prominent element of the page. CSS costs one hidden <img> and never
 * flashes.
 *
 * Falls back gracefully: dark variant → light variant → the built-in mark →
 * a wordmark. A shop that has not uploaded a logo yet still has a usable header
 * rather than a broken image.
 */

const isMedia = (value: unknown): value is Media =>
  Boolean(value && typeof value === 'object' && (value as Media).url)

export const BrandLogo: React.FC<{
  className?: string
  /** Forces one variant — for contexts with a known background, e.g. a dark footer. */
  variant?: 'light' | 'dark'
}> = async ({ className, variant }) => {
  const company = await getCompany()
  const name = companyName(company)

  const light = isMedia(company.logoLight) ? company.logoLight : null
  const dark = isMedia(company.logoDark) ? company.logoDark : light
  const mark = isMedia(company.logoMark) ? company.logoMark : null
  const height = company.logoHeight ?? 28

  // No horizontal logo uploaded, but a square MARK exists — render mark +
  // wordmark text. A shop that has only designed its icon still gets a real
  // branded header, not the built-in placeholder. The wordmark TEXT is its
  // own setting (brand ≠ legal entity ≠ header text): "yourshop.com" in the
  // header while titles/emails use the trading name and terms use the
  // registered entity. Size follows the admin's logoHeight.
  if (!light && mark) {
    const wordmark = company.brandWordmark?.trim() || name
    return (
      <span className={cn('flex items-center gap-2.5', className)}>
        <Image
          alt={mark.alt || `${name} logo`}
          className="w-auto rounded-lg object-contain"
          height={height}
          priority
          src={mark.url!}
          style={{ height }}
          width={height}
        />
        <span className="whitespace-nowrap font-display text-2xl leading-none tracking-tight">
          {wordmark}
        </span>
      </span>
    )
  }

  // Nothing uploaded at all — use the built-in mark alongside the name so the
  // header still reads as a brand rather than a placeholder.
  if (!light) {
    return (
      <span className={cn('flex items-center gap-2', className)}>
        <LogoIcon className="h-6 w-auto" />
        <span className="font-display text-lg leading-none tracking-tight">{name}</span>
      </span>
    )
  }

  const render = (media: Media, extra: string) => (
    <Image
      alt={media.alt || `${name} logo`}
      className={cn('w-auto object-contain', extra)}
      height={height}
      // Logos sit in the header and are usually the LCP element on inner pages.
      priority
      src={media.url!}
      style={{ height }}
      width={Math.round(height * ((media.width ?? 4) / (media.height ?? 1)))}
    />
  )

  if (variant === 'light') return <span className={className}>{render(light, '')}</span>
  if (variant === 'dark' && dark) return <span className={className}>{render(dark, '')}</span>

  return (
    <span className={cn('inline-flex items-center', className)}>
      {render(light, 'block dark:hidden')}
      {dark && render(dark, 'hidden dark:block')}
      {/* No dark variant uploaded — invert the light one rather than showing
          a black logo on a black header. */}
      {!company.logoDark && (
        <span className="sr-only">{name}</span>
      )}
    </span>
  )
}
