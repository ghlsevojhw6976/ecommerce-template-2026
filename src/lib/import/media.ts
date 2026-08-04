import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Payload } from 'payload'

/**
 * Downloads remote product images and stores them locally.
 *
 * The source images are hosted on a supplier CDN. Hotlinking is not an option:
 * the URLs can be revoked or rate-limited at any time, they add a third-party
 * request to every product view, and Merchant Center expects images served
 * from a host you control. Everything is fetched once at import and served from
 * our own storage afterwards.
 *
 * Two caches make re-runs cheap:
 *  - an in-memory URL→id map, so images shared across variants download once
 *  - a lookup against existing Media by the derived filename, so re-importing
 *    does not re-download thousands of files
 */

export type MediaCache = Map<string, number | string>

const MAX_BYTES = 12 * 1024 * 1024

/** Stable, collision-resistant filename derived from the URL. */
const filenameFor = (url: string): string => {
  const clean = url.split('?')[0] ?? url
  const base = path.basename(clean).replace(/[^a-zA-Z0-9._-]/g, '')
  const ext = (path.extname(base) || '.jpg').toLowerCase()
  const stem = path.basename(base, path.extname(base)).slice(0, 60) || 'image'

  // Short hash of the full URL so two files with the same basename from
  // different paths cannot overwrite each other.
  let hash = 0
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) | 0
  return `${stem}-${Math.abs(hash).toString(36)}${ext}`
}

export const importImage = async ({
  payload,
  url,
  alt,
  cache,
}: {
  payload: Payload
  url: string
  alt: string
  cache: MediaCache
}): Promise<number | string | null> => {
  if (!url || !/^https?:\/\//i.test(url)) return null

  const cached = cache.get(url)
  if (cached) return cached

  const filename = filenameFor(url)

  // Already imported in a previous run?
  const existing = await payload.find({
    collection: 'media',
    depth: 0,
    limit: 1,
    where: { filename: { equals: filename } },
  })

  if (existing.docs[0]) {
    cache.set(url, existing.docs[0].id)
    return existing.docs[0].id
  }

  let tempPath: string | null = null

  try {
    const response = await fetch(url, {
      headers: {
        // Some CDNs reject requests without a browser-like UA.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
    })

    if (!response.ok) return null

    const type = response.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length || buffer.length > MAX_BYTES) return null

    // The temp file's basename becomes the stored filename, so it must match
    // the name the existence check above looks for EXACTLY. Prefixing it here
    // (as this once did) means the lookup never matches and every run
    // re-downloads and re-creates every image — thousands of orphaned files.
    //
    // Uniqueness comes from a per-download directory, not from the filename.
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-import-'))
    tempPath = path.join(tempDir, filename)
    fs.writeFileSync(tempPath, buffer)

    const media = await payload.create({
      collection: 'media',
      data: { alt } as never,
      filePath: tempPath,
    })

    cache.set(url, media.id)
    return media.id
  } catch {
    // One bad image must never abort a 391-product import.
    return null
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath)
        fs.rmdirSync(path.dirname(tempPath))
      } catch {
        /* best effort */
      }
    }
  }
}

/** Imports a list of URLs, preserving order and dropping failures. */
export const importImages = async ({
  payload,
  urls,
  alt,
  cache,
  limit,
}: {
  payload: Payload
  urls: string[]
  alt: string
  cache: MediaCache
  limit: number
}): Promise<(number | string)[]> => {
  const ids: (number | string)[] = []
  const seen = new Set<string>()

  for (const url of urls) {
    if (ids.length >= limit) break
    if (seen.has(url)) continue
    seen.add(url)

    const id = await importImage({ payload, url, alt, cache })
    if (id) ids.push(id)
  }

  return ids
}
