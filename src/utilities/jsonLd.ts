/**
 * Serialize a JSON-LD object for a <script type="application/ld+json"> block.
 *
 * Plain JSON.stringify is an XSS/breakage hazard here: a product title
 * containing "</script>" (one bad CSV import away) terminates the script
 * element mid-JSON. Escaping "<" keeps the payload inert while remaining
 * valid JSON — the standard defense for inline JSON-LD.
 */
export const jsonLdScript = (data: unknown): string =>
  JSON.stringify(data).replace(/</g, '\\u003c')

/**
 * Drop keys whose values are undefined, null, empty string or empty array —
 * structured data with hollow properties ("logo": "") is worse than omitting
 * them, and on a fresh shop most Company fields ARE empty.
 */
export const compactJsonLd = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out as Partial<T>
}
