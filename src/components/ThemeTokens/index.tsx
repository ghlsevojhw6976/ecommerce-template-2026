import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

import { emitStylesheet } from '@/lib/theme/emitTokens'
import { themeFromInput } from '@/lib/theme/palette'

const DENSITY_SCALE: Record<string, string> = {
  compact: '0.85',
  comfortable: '1',
  spacious: '1.25',
}

/**
 * Injects the shop's brand tokens into the document head.
 *
 * Server component, rendered in the root layout. Emits the same shadcn token
 * names the components already consume, so a palette change re-themes the
 * entire storefront without touching a single component — and without a
 * rebuild, because this runs per request.
 *
 * Fails silently to the default theme: a malformed palette must never take the
 * shop down. The admin preview is where mistakes get surfaced.
 */
export const ThemeTokens: React.FC = async () => {
  let css = ''

  try {
    const payload = await getPayload({ config: configPromise })
    const settings = await payload.findGlobal({ slug: 'brand-settings', depth: 0 })

    const structure: string[] = []
    if (settings?.radius) structure.push(`  --radius: ${settings.radius};`)
    if (settings?.density && DENSITY_SCALE[settings.density]) {
      structure.push(`  --density-scale: ${DENSITY_SCALE[settings.density]};`)
    }

    if (settings?.palette) {
      const resolved = themeFromInput(settings.palette)
      if (resolved) {
        css = emitStylesheet(resolved.theme, settings.enableDarkMode !== false)
      }
    }

    if (structure.length) {
      css += `\n:root {\n${structure.join('\n')}\n}`
    }
  } catch {
    // No global yet, or the database is unreachable during a build — the
    // default tokens in globals.css remain in force.
    return null
  }

  if (!css.trim()) return null

  return <style dangerouslySetInnerHTML={{ __html: css }} id="brand-tokens" />
}
