import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { checkRole } from '@/access/utilities'
import { oklchToHex } from '@/lib/theme/color'
import { themeFromInput } from '@/lib/theme/palette'

/**
 * Resolves a palette for the admin preview.
 *
 * Returns the assigned roles as hex (for swatches) plus every contrast decision
 * the engine made, so the admin sees exactly what changed and why before
 * committing to a palette.
 */
export async function POST(req: Request): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!user || !checkRole(['admin'], user)) {
    return new Response('Action forbidden.', { status: 403 })
  }

  let input = ''
  try {
    input = ((await req.json()) as { palette?: string })?.palette ?? ''
  } catch {
    return new Response('Invalid JSON body.', { status: 400 })
  }

  const resolved = themeFromInput(input)

  if (!resolved) {
    return Response.json({
      ok: false,
      message:
        'Could not read a palette from that. Paste a coolors.co URL or at least three hex codes.',
    })
  }

  const { theme, hexes } = resolved

  return Response.json({
    ok: true,
    source: hexes,
    roles: {
      surface: oklchToHex(theme.roles.surface),
      ink: oklchToHex(theme.foregrounds.onSurface),
      primary: oklchToHex(theme.roles.primary),
      onPrimary: oklchToHex(theme.foregrounds.onPrimary),
      accent: oklchToHex(theme.roles.accent),
      onAccent: oklchToHex(theme.foregrounds.onAccent),
      support: oklchToHex(theme.roles.support),
      muted: oklchToHex(theme.muted),
      mutedForeground: oklchToHex(theme.mutedForeground),
      border: oklchToHex(theme.border),
    },
    checks: theme.checks,
    accessible: theme.accessible,
  })
}
