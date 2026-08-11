import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * One-off: product 471's shortDescription/description still opened with
 * "The Revere Gourmet 6-Piece Tri-Ply Copper Cookware Set with sits in..." —
 * the same wrong brand+piece-count carried over from the corrupted source
 * data already fixed in the title (see gmcBrandFixesRound2.ts). Surfaced by
 * a fresh gmcFinalAudit.ts run after the title fix (piece-count-conflict:
 * title says 10, description said 6).
 *
 *   pnpm exec tsx --env-file=.env src/scripts/gmcFix471Description.ts
 */

const FROM = 'The Revere Gourmet 6-Piece Tri-Ply Copper Cookware Set with'
const TO = 'The Ciwete Whole Tri-Ply 18/10 Stainless Steel Cookware Set'

const replaceInLexical = (node: any, from: string, to: string): boolean => {
  let changed = false
  if (node && typeof node === 'object') {
    if (typeof node.text === 'string' && node.text.includes(from)) {
      node.text = node.text.split(from).join(to)
      changed = true
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (replaceInLexical(child, from, to)) changed = true
      }
    }
    if (node.root) {
      if (replaceInLexical(node.root, from, to)) changed = true
    }
  }
  return changed
}

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const p: any = await payload.findByID({ collection: 'products', id: 471, depth: 0 })

  const data: Record<string, unknown> = {}

  if (typeof p.shortDescription === 'string' && p.shortDescription.includes(FROM)) {
    data.shortDescription = p.shortDescription.split(FROM).join(TO)
  } else {
    console.log('shortDescription did not contain expected text — skipped')
  }

  if (p.description) {
    const descCopy = JSON.parse(JSON.stringify(p.description))
    if (replaceInLexical(descCopy, FROM, TO)) {
      data.description = descCopy
    } else {
      console.log('description did not contain expected text — skipped')
    }
  }

  if (Object.keys(data).length) {
    await payload.update({ collection: 'products', id: 471, data: data as never })
    console.log('Applied:', Object.keys(data))
  } else {
    console.log('Nothing to apply.')
  }
  process.exit(0)
}

run()
