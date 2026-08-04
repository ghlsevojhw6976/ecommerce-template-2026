/**
 * Colour maths for the palette engine.
 *
 * Pure, dependency-free and synchronous, so every guarantee the engine makes —
 * especially the contrast ones — is unit-testable without a browser.
 *
 * OKLCH is used throughout rather than HSL because it is perceptually uniform:
 * changing L by a fixed amount changes *apparent* lightness by the same amount
 * regardless of hue. In HSL, `hsl(60 100% 50%)` (yellow) and `hsl(240 100% 50%)`
 * (blue) claim identical lightness while differing enormously in perceived
 * brightness — which makes deriving readable tints from an arbitrary palette
 * impossible. In OKLCH it is arithmetic.
 *
 * Conversion matrices are Björn Ottosson's OKLab definition.
 */

export type RGB = { r: number; g: number; b: number } // 0–1
export type OKLCH = { l: number; c: number; h: number } // l 0–1, c 0–~0.4, h 0–360

// ---------------------------------------------------------------------------
// Hex ↔ sRGB
// ---------------------------------------------------------------------------

export const parseHex = (hex: string): RGB | null => {
  const cleaned = hex.trim().replace(/^#/, '')

  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : cleaned

  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null

  return {
    r: parseInt(expanded.slice(0, 2), 16) / 255,
    g: parseInt(expanded.slice(2, 4), 16) / 255,
    b: parseInt(expanded.slice(4, 6), 16) / 255,
  }
}

const toHexPart = (v: number): string =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, '0')

export const toHex = ({ r, g, b }: RGB): string =>
  `#${toHexPart(r)}${toHexPart(g)}${toHexPart(b)}`

// ---------------------------------------------------------------------------
// sRGB gamma
// ---------------------------------------------------------------------------

const linearise = (v: number): number =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)

const delinearise = (v: number): number =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055

// ---------------------------------------------------------------------------
// sRGB ↔ OKLCH
// ---------------------------------------------------------------------------

export const rgbToOklch = ({ r, g, b }: RGB): OKLCH => {
  const lr = linearise(r)
  const lg = linearise(g)
  const lb = linearise(b)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const c = Math.sqrt(A * A + B * B)
  let h = (Math.atan2(B, A) * 180) / Math.PI
  if (h < 0) h += 360

  return { l: L, c, h }
}

export const oklchToRgb = ({ l: L, c, h }: OKLCH): RGB => {
  const hRad = (h * Math.PI) / 180
  const A = c * Math.cos(hRad)
  const B = c * Math.sin(hRad)

  const l_ = L + 0.3963377774 * A + 0.2158037573 * B
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B
  const s_ = L - 0.0894841775 * A - 1.291485548 * B

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return {
    r: delinearise(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: delinearise(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: delinearise(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

export const hexToOklch = (hex: string): OKLCH | null => {
  const rgb = parseHex(hex)
  return rgb ? rgbToOklch(rgb) : null
}

/**
 * OKLCH → hex.
 *
 * Out-of-gamut colours are clamped per channel. A more correct approach reduces
 * chroma until the colour fits sRGB, which we do in `clampToGamut` below —
 * naive clamping shifts hue on saturated colours.
 */
export const oklchToHex = (color: OKLCH): string => toHex(oklchToRgb(color))

const inGamut = ({ r, g, b }: RGB): boolean =>
  r >= -0.0001 && r <= 1.0001 && g >= -0.0001 && g <= 1.0001 && b >= -0.0001 && b <= 1.0001

/**
 * Pulls chroma down until the colour is representable in sRGB, preserving
 * lightness and hue. Binary search — 20 iterations is well past visual
 * precision.
 */
export const clampToGamut = (color: OKLCH): OKLCH => {
  if (inGamut(oklchToRgb(color))) return color

  let lo = 0
  let hi = color.c

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklchToRgb({ ...color, c: mid }))) lo = mid
    else hi = mid
  }

  return { ...color, c: lo }
}

/** CSS `oklch()` string, rounded to sane precision. */
export const formatOklch = ({ l, c, h }: OKLCH): string =>
  `oklch(${(l * 100).toFixed(2)}% ${c.toFixed(4)} ${h.toFixed(2)}deg)`

// ---------------------------------------------------------------------------
// WCAG contrast
// ---------------------------------------------------------------------------

/** WCAG 2.1 relative luminance. Note the weights differ from OKLab lightness. */
export const relativeLuminance = ({ r, g, b }: RGB): number =>
  0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)

/** WCAG contrast ratio, 1–21. Order of arguments does not matter. */
export const contrastRatio = (a: RGB, b: RGB): number => {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export const contrastHex = (a: string, b: string): number => {
  const rgbA = parseHex(a)
  const rgbB = parseHex(b)
  if (!rgbA || !rgbB) return 1
  return contrastRatio(rgbA, rgbB)
}

/** WCAG AA thresholds. */
export const AA_TEXT = 4.5
export const AA_LARGE_TEXT = 3
export const AA_UI = 3

/**
 * Picks whichever of two foregrounds contrasts better against a background.
 * Used to choose ink-on-brand vs surface-on-brand for buttons and badges.
 */
export const bestForeground = (background: OKLCH, candidates: OKLCH[]): OKLCH => {
  const bgRgb = oklchToRgb(background)

  return candidates.reduce((best, candidate) =>
    contrastRatio(bgRgb, oklchToRgb(candidate)) > contrastRatio(bgRgb, oklchToRgb(best))
      ? candidate
      : best,
  )
}

/**
 * Walks a colour's lightness until it reaches `target` contrast against a
 * background, or runs out of room.
 *
 * This is the engine's core promise: any trending palette produces a legible
 * shop. Trending palettes are chosen to look good as a row of swatches and are
 * frequently all mid-lightness — applied literally they yield 2:1 body text.
 *
 * Direction is chosen by which way has more headroom, so a dark background
 * pushes its foreground lighter and vice versa.
 */
export const enforceContrast = (
  color: OKLCH,
  background: OKLCH,
  target: number = AA_TEXT,
): { color: OKLCH; adjusted: boolean; ratio: number; achieved: boolean } => {
  const bgRgb = oklchToRgb(background)
  const startRatio = contrastRatio(bgRgb, oklchToRgb(color))

  if (startRatio >= target) {
    return { color, adjusted: false, ratio: startRatio, achieved: true }
  }

  // Move away from the background: if the background is dark, go lighter.
  const direction = background.l < 0.5 ? 1 : -1

  let best = color
  let bestRatio = startRatio

  // 1% lightness steps — fine enough to avoid overshooting a hue's usable range.
  for (let step = 1; step <= 100; step++) {
    const l = color.l + direction * step * 0.01
    if (l < 0 || l > 1) break

    const candidate = clampToGamut({ ...color, l })
    const ratio = contrastRatio(bgRgb, oklchToRgb(candidate))

    if (ratio > bestRatio) {
      best = candidate
      bestRatio = ratio
    }

    if (ratio >= target) {
      return { color: candidate, adjusted: true, ratio, achieved: true }
    }
  }

  // Ran out of lightness. Return the best found and report honestly rather than
  // silently shipping something unreadable.
  return { color: best, adjusted: true, ratio: bestRatio, achieved: false }
}
