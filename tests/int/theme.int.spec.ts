import { describe, it, expect } from 'vitest'

import {
  AA_TEXT,
  clampToGamut,
  contrastHex,
  contrastRatio,
  enforceContrast,
  hexToOklch,
  oklchToHex,
  oklchToRgb,
  parseHex,
  rgbToOklch,
} from '@/lib/theme/color'
import { assignRoles, parsePalette, resolveTheme, themeFromInput } from '@/lib/theme/palette'
import { emitStylesheet, emitTokens } from '@/lib/theme/emitTokens'

/**
 * The engine makes one promise: paste ANY trending palette and get a legible
 * shop. These tests are what make that promise true rather than aspirational —
 * they run the real trending palettes through the whole pipeline and assert
 * every text pairing clears WCAG AA.
 */

// Real palettes from coolors.co/palettes/trending. Deliberately awkward:
// several are all mid-lightness with no natural background or text colour,
// which is exactly the case that breaks naive palette application.
const TRENDING = [
  '264653-2a9d8f-e9c46a-f4a261-e76f51',
  '606c38-283618-fefae0-dda15e-bc6c25',
  '000000-14213d-fca311-e5e5e5-ffffff',
  'cdb4db-ffc8dd-ffafcc-bde0fe-a2d2ff', // all pastel — no dark colour at all
  '03045e-0077b6-00b4d8-90e0ef-caf0f8',
  '780000-c1121f-fdf0d5-003049-669bbc',
  'f72585-b5179e-7209b7-560bad-480ca8', // all dark saturated — no light colour
  '2d3142-bfc0c0-ffffff-ef8354-4f5d75',
]

describe('colour maths', () => {
  it('round-trips hex through OKLCH', () => {
    for (const hex of ['#264653', '#e9c46a', '#ffffff', '#000000', '#00b4d8']) {
      const oklch = hexToOklch(hex)!
      expect(oklchToHex(oklch)).toBe(hex)
    }
  })

  it('parses shorthand and hash-less hex', () => {
    expect(parseHex('#fff')).toEqual({ r: 1, g: 1, b: 1 })
    expect(parseHex('264653')).not.toBeNull()
    expect(parseHex('nope')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
  })

  it('matches known WCAG contrast ratios', () => {
    // Black on white is the canonical 21:1.
    expect(contrastHex('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastHex('#ffffff', '#ffffff')).toBeCloseTo(1, 2)
    // A known mid-grey pairing.
    expect(contrastHex('#767676', '#ffffff')).toBeGreaterThan(4.5)
    expect(contrastHex('#777777', '#ffffff')).toBeGreaterThan(4.4)
  })

  it('is symmetric in argument order', () => {
    const a = parseHex('#264653')!
    const b = parseHex('#e9c46a')!
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 6)
  })

  it('reports OKLCH lightness perceptually — yellow is lighter than blue', () => {
    // The exact failure HSL has: both claim 50% lightness.
    const yellow = rgbToOklch(parseHex('#ffff00')!)
    const blue = rgbToOklch(parseHex('#0000ff')!)
    expect(yellow.l).toBeGreaterThan(blue.l)
  })

  it('clamps out-of-gamut chroma without moving hue', () => {
    const absurd = { l: 0.6, c: 0.9, h: 150 }
    const clamped = clampToGamut(absurd)
    expect(clamped.c).toBeLessThan(absurd.c)
    expect(clamped.h).toBe(absurd.h)
    const { r, g, b } = oklchToRgb(clamped)
    for (const channel of [r, g, b]) {
      expect(channel).toBeGreaterThanOrEqual(-0.001)
      expect(channel).toBeLessThanOrEqual(1.001)
    }
  })
})

describe('enforceContrast', () => {
  it('leaves an already-passing pair alone', () => {
    const result = enforceContrast(hexToOklch('#000000')!, hexToOklch('#ffffff')!, AA_TEXT)
    expect(result.adjusted).toBe(false)
    expect(result.achieved).toBe(true)
  })

  it('darkens a foreground that is too light for a light background', () => {
    const bg = hexToOklch('#ffffff')!
    const fg = hexToOklch('#e9c46a')! // 1.7:1 — unreadable
    expect(contrastRatio(oklchToRgb(bg), oklchToRgb(fg))).toBeLessThan(AA_TEXT)

    const result = enforceContrast(fg, bg, AA_TEXT)
    expect(result.achieved).toBe(true)
    expect(result.adjusted).toBe(true)
    expect(result.ratio).toBeGreaterThanOrEqual(AA_TEXT)
    expect(result.color.l).toBeLessThan(fg.l)
  })

  it('lightens a foreground on a dark background', () => {
    const bg = hexToOklch('#14213d')!
    const fg = hexToOklch('#283618')!
    const result = enforceContrast(fg, bg, AA_TEXT)
    expect(result.achieved).toBe(true)
    expect(result.color.l).toBeGreaterThan(fg.l)
  })

  it('preserves hue while adjusting lightness', () => {
    const bg = hexToOklch('#ffffff')!
    const fg = hexToOklch('#90e0ef')!
    const result = enforceContrast(fg, bg, AA_TEXT)
    expect(Math.abs(result.color.h - fg.h)).toBeLessThan(2)
  })
})

describe('parsePalette', () => {
  it('extracts hexes from a coolors URL', () => {
    expect(parsePalette('https://coolors.co/palette/264653-2a9d8f-e9c46a-f4a261-e76f51')).toEqual([
      '#264653',
      '#2a9d8f',
      '#e9c46a',
      '#f4a261',
      '#e76f51',
    ])
  })

  it('tolerates a trailing slash, query string and no protocol', () => {
    expect(parsePalette('coolors.co/palette/264653-2a9d8f-e9c46a/?x=1')).toHaveLength(3)
  })

  it('accepts a bare hex list in several separators', () => {
    expect(parsePalette('#264653, #2a9d8f #e9c46a')).toHaveLength(3)
  })

  it('de-duplicates repeated swatches so two roles cannot collapse', () => {
    expect(parsePalette('264653-264653-2a9d8f')).toEqual(['#264653', '#2a9d8f'])
  })

  it('returns nothing for junk', () => {
    expect(parsePalette('')).toEqual([])
    expect(parsePalette('https://example.com/nothing-here')).toEqual([])
  })
})

describe('assignRoles', () => {
  it('needs at least three colours', () => {
    expect(assignRoles(['#264653', '#2a9d8f'])).toBeNull()
    expect(assignRoles(['#264653', '#2a9d8f', '#e9c46a'])).not.toBeNull()
  })

  it('derives a near-white surface and near-black ink regardless of input', () => {
    // The all-pastel palette contains nothing dark; ink must still be readable.
    const roles = assignRoles(parsePalette('cdb4db-ffc8dd-ffafcc-bde0fe-a2d2ff'))!
    expect(roles.surface.l).toBeGreaterThan(0.95)
    expect(roles.ink.l).toBeLessThan(0.3)
  })

  it('ignores swatch order — role assignment is by lightness and chroma', () => {
    const forward = assignRoles(parsePalette('264653-2a9d8f-e9c46a-f4a261-e76f51'))!
    const reversed = assignRoles(parsePalette('e76f51-f4a261-e9c46a-2a9d8f-264653'))!
    expect(forward.primary.h).toBeCloseTo(reversed.primary.h, 4)
    expect(forward.surface.l).toBeCloseTo(reversed.surface.l, 4)
  })

  it('keeps neutrals tinted with the palette hue rather than flat grey', () => {
    const roles = assignRoles(parsePalette('03045e-0077b6-00b4d8-90e0ef-caf0f8'))!
    expect(roles.surface.c).toBeGreaterThan(0)
  })
})

describe('the promise: every trending palette produces a legible shop', () => {
  it.each(TRENDING)('palette %s clears WCAG AA on all text pairings', (palette) => {
    const result = themeFromInput(palette)
    expect(result).not.toBeNull()

    const { theme } = result!

    // Informational checks (decorative dividers) are reported but not gated —
    // see the WCAG 1.4.11 note in palette.ts.
    for (const check of theme.checks.filter((c) => !c.informational)) {
      expect(
        check.passes,
        `"${check.pairing}" was ${check.ratio}:1, needed ${check.required}:1`,
      ).toBe(true)
    }

    expect(theme.accessible).toBe(true)
  })

  it.each(TRENDING)('palette %s keeps body text at or above 4.5:1', (palette) => {
    const { theme } = themeFromInput(palette)!
    const ratio = contrastRatio(
      oklchToRgb(theme.roles.surface),
      oklchToRgb(theme.foregrounds.onSurface),
    )
    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it.each(TRENDING)('palette %s keeps button labels readable', (palette) => {
    const { theme } = themeFromInput(palette)!

    const pairs: [string, typeof theme.roles.primary, typeof theme.foregrounds.onPrimary][] = [
      ['primary', theme.roles.primary, theme.foregrounds.onPrimary],
      ['accent', theme.roles.accent, theme.foregrounds.onAccent],
    ]

    for (const [label, bg, fg] of pairs) {
      const ratio = contrastRatio(oklchToRgb(bg), oklchToRgb(fg))
      expect(ratio, `${label} label contrast`).toBeGreaterThanOrEqual(AA_TEXT)
    }
  })

  it('reports every pairing it evaluated, so nothing changes silently', () => {
    const { theme } = themeFromInput('ffffff-fefae0-e9c46a-f4a261-333333')!

    expect(theme.checks.length).toBeGreaterThan(4)
    for (const label of ['Body text on surface', 'Label on primary', 'Muted text on surface']) {
      expect(theme.checks.some((c) => c.pairing === label)).toBe(true)
    }
  })

  it('any pairing it reports as adjusted actually ends up passing', () => {
    // The guarantee that matters: adjustment is not cosmetic bookkeeping.
    for (const palette of TRENDING) {
      const { theme } = themeFromInput(palette)!
      for (const check of theme.checks.filter((c) => c.adjusted && !c.informational)) {
        expect(check.passes, `${palette} → ${check.pairing}`).toBe(true)
      }
    }
  })

  it('treats decorative dividers as informational, not failures', () => {
    // WCAG 1.4.11 covers UI component boundaries, not section rules. Gating a
    // divider at 3:1 would force heavy black lines onto every shop.
    const { theme } = themeFromInput('264653-2a9d8f-e9c46a-f4a261-e76f51')!
    const divider = theme.checks.find((c) => c.pairing.includes('Divider'))

    expect(divider?.informational).toBe(true)
    expect(theme.accessible).toBe(true)
  })

  it('still enforces 3:1 on input borders and focus rings', () => {
    for (const palette of TRENDING) {
      const { theme } = themeFromInput(palette)!
      for (const label of ['Input border on surface', 'Focus ring on surface']) {
        const check = theme.checks.find((c) => c.pairing === label)!
        expect(check.informational).toBeFalsy()
        expect(check.passes, `${palette} → ${label} was ${check.ratio}:1`).toBe(true)
      }
    }
  })
})

describe('token emission', () => {
  it('writes the shadcn token names the components already consume', () => {
    const { theme } = themeFromInput('264653-2a9d8f-e9c46a-f4a261-e76f51')!
    const css = emitTokens(theme)

    for (const token of [
      '--background',
      '--foreground',
      '--primary',
      '--primary-foreground',
      '--muted-foreground',
      '--border',
      '--ring',
    ]) {
      expect(css).toContain(token)
    }
  })

  it('emits valid oklch() values', () => {
    const { theme } = themeFromInput('264653-2a9d8f-e9c46a')!
    const css = emitTokens(theme)
    const values = css.match(/oklch\([^)]+\)/g) ?? []
    expect(values.length).toBeGreaterThan(10)
    for (const value of values) {
      expect(value).toMatch(/^oklch\(\d+(\.\d+)?% \d+(\.\d+)? -?\d+(\.\d+)?deg\)$/)
    }
  })

  it('does NOT emit functional colours — sale must never collide with error', () => {
    const { theme } = themeFromInput('780000-c1121f-fdf0d5-003049-669bbc')!
    const css = emitTokens(theme)
    expect(css).not.toContain('--success')
    expect(css).not.toContain('--error')
    expect(css).not.toContain('--warning')
  })

  it('produces a dark variant that is not a naive inversion', () => {
    const { theme } = themeFromInput('264653-2a9d8f-e9c46a-f4a261-e76f51')!
    const css = emitStylesheet(theme)
    expect(css).toContain("[data-theme='dark']")

    // Dark primary should be lighter than light-mode primary, not merely flipped.
    const darkBlock = css.split("[data-theme='dark']")[1]!
    expect(darkBlock).toContain('--primary')
  })

  it('generates a full brand ramp', () => {
    const { theme } = themeFromInput('264653-2a9d8f-e9c46a')!
    const css = emitTokens(theme)
    for (const stop of [50, 500, 950]) {
      expect(css).toContain(`--brand-primary-${stop}`)
    }
  })
})
