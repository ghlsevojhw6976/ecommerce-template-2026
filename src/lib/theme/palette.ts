import {
  AA_TEXT,
  AA_UI,
  bestForeground,
  clampToGamut,
  contrastRatio,
  enforceContrast,
  hexToOklch,
  oklchToHex,
  oklchToRgb,
  parseHex,
  type OKLCH,
} from './color'

/**
 * Palette → design system.
 *
 * A coolors palette is five colours chosen to look good as a row of swatches.
 * A shop needs surfaces, text, borders and states that stay legible in every
 * combination. Turning one into the other is this file's job.
 *
 * See docs/design/2026-07-28-ui-plan.md §4
 */

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Accepts a coolors URL or a loose list of hex codes.
 *
 * Coolors puts the hexes directly in the path —
 * `coolors.co/palette/264653-2a9d8f-e9c46a-f4a261-e76f51` — so no API, key or
 * scraping is involved.
 */
export const parsePalette = (input: string): string[] => {
  const trimmed = input.trim()
  if (!trimmed) return []

  // Take the last path segment for URLs; otherwise treat the whole string.
  const candidate = /coolors\.co/i.test(trimmed)
    ? (trimmed.split('?')[0]?.replace(/\/$/, '').split('/').pop() ?? '')
    : trimmed

  const tokens = candidate.split(/[-,\s/]+/).filter(Boolean)

  const hexes: string[] = []
  for (const token of tokens) {
    const rgb = parseHex(token)
    if (rgb) {
      const normalised = `#${token.replace(/^#/, '').toLowerCase()}`
      // De-duplicate: a repeated swatch would collapse two roles onto one colour.
      if (!hexes.includes(normalised)) hexes.push(normalised)
    }
  }

  return hexes
}

// ---------------------------------------------------------------------------
// Role assignment
// ---------------------------------------------------------------------------

export type PaletteRoles = {
  surface: OKLCH
  ink: OKLCH
  primary: OKLCH
  accent: OKLCH
  support: OKLCH
}

const SURFACE_TARGET_L = 0.985
const INK_TARGET_L = 0.19

/**
 * Assigns semantic roles by lightness and chroma — never by position in the URL.
 *
 * Nothing about a coolors palette says the first swatch should be "primary";
 * the order is decorative. Deriving roles from the colours themselves is what
 * makes any palette usable.
 *
 * Surface and ink are pushed to the extremes rather than used as-is. A trending
 * palette rarely contains a near-white and a near-black, and using its lightest
 * mid-tone as a page background is exactly how these end up unreadable. Their
 * *hue* is kept, so the neutrals stay in the palette's family.
 */
export const assignRoles = (hexes: string[]): PaletteRoles | null => {
  const colors = hexes
    .map(hexToOklch)
    .filter((c): c is OKLCH => c !== null)
    .map(clampToGamut)

  if (colors.length < 3) return null

  const byLightness = [...colors].sort((a, b) => a.l - b.l)
  const byChroma = [...colors].sort((a, b) => b.c - a.c)

  const lightest = byLightness[byLightness.length - 1]!
  const darkest = byLightness[0]!

  // Tint the neutrals with their source hue instead of using flat grey — this
  // is what stops every shop's background looking identical.
  const surface: OKLCH = { l: SURFACE_TARGET_L, c: Math.min(lightest.c, 0.008), h: lightest.h }
  const ink: OKLCH = { l: INK_TARGET_L, c: Math.min(darkest.c, 0.03), h: darkest.h }

  // Chromatic roles: most colourful first, excluding whatever became a neutral.
  const chromatic = byChroma.filter((c) => c !== lightest && c !== darkest)
  const pool = chromatic.length ? chromatic : byChroma

  const primary = pool[0]!
  const accent = pool[1] ?? primary
  const support = pool[2] ?? accent

  return { surface, ink, primary, accent, support }
}

// ---------------------------------------------------------------------------
// Scale derivation
// ---------------------------------------------------------------------------

const RAMP_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
const RAMP_LIGHTNESS = [0.97, 0.94, 0.87, 0.78, 0.68, 0.58, 0.5, 0.42, 0.34, 0.26, 0.18]

/**
 * A 50–950 ramp from one colour, keeping hue and easing chroma toward the ends
 * so the extremes do not look radioactive.
 */
export const deriveScale = (color: OKLCH): Record<number, OKLCH> => {
  const scale: Record<number, OKLCH> = {}

  RAMP_STOPS.forEach((stop, i) => {
    const l = RAMP_LIGHTNESS[i]!
    // Chroma peaks in the middle of the ramp and falls off at both ends.
    const distanceFromMid = Math.abs(l - 0.58) / 0.58
    const c = color.c * (1 - distanceFromMid * 0.55)
    scale[stop] = clampToGamut({ l, c: Math.max(c, 0), h: color.h })
  })

  return scale
}

// ---------------------------------------------------------------------------
// Contrast report
// ---------------------------------------------------------------------------

export type ContrastCheck = {
  pairing: string
  ratio: number
  required: number
  passes: boolean
  adjusted: boolean
  /**
   * Reported to the admin but not gated on.
   *
   * WCAG 1.4.11 requires 3:1 for UI components whose boundary is *essential to
   * understanding* — input outlines, focus rings. A decorative rule between
   * sections is not covered, and forcing one to 3:1 produces heavy black lines
   * that read cheap. Those are surfaced as information, not failures.
   */
  informational?: boolean
}

export type ResolvedTheme = {
  roles: PaletteRoles
  /** Foreground chosen per surface, already contrast-corrected. */
  foregrounds: {
    onSurface: OKLCH
    onPrimary: OKLCH
    onAccent: OKLCH
    onSupport: OKLCH
  }
  muted: OKLCH
  mutedForeground: OKLCH
  /** Decorative dividers. Subtle by design. */
  border: OKLCH
  /** Form control outlines — held to 3:1. */
  inputBorder: OKLCH
  /** Focus ring — held to 3:1, derived from primary but never written back to it. */
  ring: OKLCH
  checks: ContrastCheck[]
  /** True when every gated pairing meets AA. Informational checks do not count. */
  accessible: boolean
}

/**
 * Resolves roles into a usable theme and reports every contrast decision.
 *
 * The reporting matters as much as the correcting: an admin who pastes a
 * palette should be told "your accent was darkened 12% to pass on buttons"
 * rather than silently getting a different colour than they picked.
 */
export const resolveTheme = (roles: PaletteRoles): ResolvedTheme => {
  const checks: ContrastCheck[] = []

  const record = (
    pairing: string,
    ratio: number,
    required: number,
    adjusted: boolean,
    informational = false,
  ): void => {
    checks.push({
      pairing,
      ratio: Math.round(ratio * 100) / 100,
      required,
      passes: ratio >= required,
      adjusted,
      informational,
    })
  }

  // Body text on the page background — the pairing that matters most.
  const inkOnSurface = enforceContrast(roles.ink, roles.surface, AA_TEXT)
  record('Body text on surface', inkOnSurface.ratio, AA_TEXT, inkOnSurface.adjusted)

  // Button labels: pick the better of ink/surface, then force it to pass.
  const resolveOn = (background: OKLCH, label: string) => {
    const candidate = bestForeground(background, [inkOnSurface.color, roles.surface])
    const enforced = enforceContrast(candidate, background, AA_TEXT)
    record(label, enforced.ratio, AA_TEXT, enforced.adjusted)
    return enforced.color
  }

  const onPrimary = resolveOn(roles.primary, 'Label on primary')
  const onAccent = resolveOn(roles.accent, 'Label on accent')
  const onSupport = resolveOn(roles.support, 'Label on support')

  // Secondary text still has to be readable — this is where "subtle grey" copy
  // usually fails audits.
  const mutedForegroundBase: OKLCH = { ...inkOnSurface.color, l: Math.min(inkOnSurface.color.l + 0.32, 0.72) }
  const mutedEnforced = enforceContrast(mutedForegroundBase, roles.surface, AA_TEXT)
  record('Muted text on surface', mutedEnforced.ratio, AA_TEXT, mutedEnforced.adjusted)

  // Decorative dividers. Kept deliberately quiet — reported, never gated.
  const borderBase: OKLCH = { ...roles.surface, l: Math.max(roles.surface.l - 0.12, 0) }
  const borderRatio = contrastRatio(oklchToRgb(borderBase), oklchToRgb(roles.surface))
  record('Divider on surface (decorative)', borderRatio, AA_UI, false, true)

  // Form outlines and focus rings ARE essential UI boundaries — a text field
  // the user cannot locate is a broken checkout. These are held to 3:1.
  const inputEnforced = enforceContrast(borderBase, roles.surface, AA_UI)
  record('Input border on surface', inputEnforced.ratio, AA_UI, inputEnforced.adjusted)

  // The focus ring is derived from primary but stored SEPARATELY. Writing it
  // back onto roles.primary would silently invalidate `onPrimary`, which was
  // already contrast-checked against the original colour — the label pairing
  // verified above would no longer be the pairing that ships.
  const ringEnforced = enforceContrast(roles.primary, roles.surface, AA_UI)
  record('Focus ring on surface', ringEnforced.ratio, AA_UI, ringEnforced.adjusted)

  const muted: OKLCH = { ...roles.surface, l: Math.max(roles.surface.l - 0.04, 0) }

  return {
    roles: { ...roles, ink: inkOnSurface.color },
    foregrounds: { onSurface: inkOnSurface.color, onPrimary, onAccent, onSupport },
    muted,
    mutedForeground: mutedEnforced.color,
    border: borderBase,
    inputBorder: inputEnforced.color,
    ring: ringEnforced.color,
    checks,
    accessible: checks.every((c) => c.informational || c.passes),
  }
}

/** Convenience: coolors URL (or hex list) straight to a resolved theme. */
export const themeFromInput = (input: string): { theme: ResolvedTheme; hexes: string[] } | null => {
  const hexes = parsePalette(input)
  const roles = assignRoles(hexes)
  if (!roles) return null
  return { theme: resolveTheme(roles), hexes }
}

export { oklchToHex }
