import { formatOklch, type OKLCH } from './color'
import { deriveScale, type ResolvedTheme } from './palette'

/**
 * Resolved theme → CSS custom properties.
 *
 * Deliberately writes the *existing* shadcn token names (`--background`,
 * `--foreground`, `--primary`, …) rather than inventing a parallel set. Every
 * component in the template already consumes those, so a palette change
 * re-themes the whole shop without touching a single component.
 *
 * Functional colours (success / warning / error) are NOT emitted here. They
 * carry fixed meaning and must survive any palette — if a shop's accent is red,
 * "Sale" and "Error" must not become the same colour.
 */

const line = (name: string, value: OKLCH): string => `  ${name}: ${formatOklch(value)};`

export const emitTokens = (theme: ResolvedTheme, selector = ':root'): string => {
  const { roles, foregrounds, muted, mutedForeground, border } = theme

  const primaryScale = deriveScale(roles.primary)
  const accentScale = deriveScale(roles.accent)

  const declarations = [
    // Core surfaces and text
    line('--background', roles.surface),
    line('--foreground', foregrounds.onSurface),
    line('--card', muted),
    line('--card-foreground', foregrounds.onSurface),
    line('--popover', roles.surface),
    line('--popover-foreground', foregrounds.onSurface),

    // Actions
    line('--primary', roles.primary),
    line('--primary-foreground', foregrounds.onPrimary),
    line('--secondary', muted),
    line('--secondary-foreground', foregrounds.onSurface),
    line('--accent', roles.accent),
    line('--accent-foreground', foregrounds.onAccent),

    // Quiet text and chrome
    line('--muted', muted),
    line('--muted-foreground', mutedForeground),
    line('--border', border),
    // Input outlines and focus rings are contrast-enforced separately from the
    // decorative divider — a field the user cannot find is a broken checkout.
    line('--input', theme.inputBorder),
    line('--ring', theme.ring),

    // Brand ramps, for anything needing a specific step
    ...Object.entries(primaryScale).map(([stop, color]) =>
      line(`--brand-primary-${stop}`, color),
    ),
    ...Object.entries(accentScale).map(([stop, color]) => line(`--brand-accent-${stop}`, color)),
    line('--brand-support', roles.support),
    line('--brand-support-foreground', foregrounds.onSupport),
  ]

  return `${selector} {\n${declarations.join('\n')}\n}`
}

/**
 * Dark variant.
 *
 * Not an inversion — flipping lightness produces muddy, over-saturated results.
 * Dark surfaces need chroma pulled back, because the same chroma reads far more
 * intensely against a dark background.
 */
export const emitDarkTokens = (theme: ResolvedTheme): string => {
  const { roles } = theme

  const surface: OKLCH = { l: 0.16, c: Math.min(roles.surface.c, 0.012), h: roles.ink.h }
  const foreground: OKLCH = { l: 0.95, c: Math.min(roles.ink.c, 0.01), h: roles.surface.h }
  const muted: OKLCH = { ...surface, l: 0.22 }
  const border: OKLCH = { ...surface, l: 0.28 }
  const mutedForeground: OKLCH = { ...foreground, l: 0.68 }

  // Lift lightness and ease chroma so brand colours stay recognisable without
  // glowing against the dark surface.
  const primary: OKLCH = { ...roles.primary, l: Math.min(roles.primary.l + 0.1, 0.8), c: roles.primary.c * 0.85 }
  const accent: OKLCH = { ...roles.accent, l: Math.min(roles.accent.l + 0.1, 0.8), c: roles.accent.c * 0.85 }

  const declarations = [
    line('--background', surface),
    line('--foreground', foreground),
    line('--card', muted),
    line('--card-foreground', foreground),
    line('--popover', muted),
    line('--popover-foreground', foreground),
    line('--primary', primary),
    line('--primary-foreground', surface),
    line('--secondary', muted),
    line('--secondary-foreground', foreground),
    line('--accent', accent),
    line('--accent-foreground', surface),
    line('--muted', muted),
    line('--muted-foreground', mutedForeground),
    line('--border', border),
    line('--input', border),
    line('--ring', primary),
  ]

  return `[data-theme='dark'] {\n${declarations.join('\n')}\n}`
}

/** Full stylesheet for injection into the document head. */
export const emitStylesheet = (theme: ResolvedTheme, includeDark = true): string =>
  [emitTokens(theme), includeDark ? emitDarkTokens(theme) : ''].filter(Boolean).join('\n\n')
