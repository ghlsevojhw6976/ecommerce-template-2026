import { getPayload } from 'payload'
import config from '@payload-config'
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'
import fs from 'fs'

/**
 * Rebuild every hard-truncated `shortDescription` (300-char field cap,
 * import script cut mid-sentence and appended "…") from the FULL,
 * untruncated text already sitting in `description` (richText, no cap) —
 * confirmed to contain the complete original for all 230 affected products
 * before this script was written (gmcCheckShortDescTruncation.ts).
 *
 * Splits on ". " followed by a capital letter (keeps the period with the
 * preceding clause) — safe against the domain's abbreviation periods
 * ("2 qt. saucepan", "11.48 kg") because those are followed by a lowercase
 * word or a digit, never a capital letter — then greedily keeps whole
 * clauses up to 300 chars. Produces a shorter-but-complete description
 * instead of a longer-but-severed one; never invents content, only trims.
 *
 * DRY_RUN=1 pnpm exec tsx --env-file=.env src/scripts/gmcFixShortDescTruncation.ts
 *           pnpm exec tsx --env-file=.env src/scripts/gmcFixShortDescTruncation.ts
 */

const MAX_LEN = 300

const splitClauses = (text: string): string[] =>
  text
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean)

const buildShortDescription = (full: string): string => {
  const clauses = splitClauses(full)
  let result = ''
  for (const clause of clauses) {
    const candidate = result ? `${result} ${clause}` : clause
    if (candidate.length <= MAX_LEN) {
      result = candidate
    } else {
      break
    }
  }
  if (result) return result

  // Fallback: even the first clause alone exceeds 300 — hard-trim to the
  // last complete word and close with a period instead of a dangling "…".
  const first = clauses[0] ?? full
  const trimmed = first.slice(0, MAX_LEN - 1).replace(/\s+\S*$/, '')
  return `${trimmed}.`
}

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const dryRun = process.env.DRY_RUN === '1'

  const { docs } = await payload.find({
    collection: 'products',
    limit: 1000,
    depth: 0,
    where: { _status: { equals: 'published' } },
  })

  const results: Record<string, unknown>[] = []

  for (const p of docs as any[]) {
    const sd: string = p.shortDescription || ''
    if (!sd.endsWith('…')) continue
    if (!p.description) continue

    const full = convertLexicalToPlaintext({ data: p.description })
    const stem = sd.slice(0, -1)
    if (!full.startsWith(stem)) {
      results.push({ id: p.id, status: 'SKIPPED — description no longer matches truncated stem' })
      continue
    }

    const rebuilt = buildShortDescription(full)
    if (rebuilt.length > MAX_LEN) {
      results.push({ id: p.id, status: 'SKIPPED — rebuilt still exceeds max length', rebuilt })
      continue
    }

    if (!dryRun) {
      await payload.update({
        collection: 'products',
        id: p.id,
        data: { shortDescription: rebuilt } as never,
      })
    }

    results.push({
      id: p.id,
      status: dryRun ? 'WOULD APPLY' : 'APPLIED',
      oldLen: sd.length,
      newLen: rebuilt.length,
      old: sd,
      new: rebuilt,
    })
  }

  fs.writeFileSync('/tmp/gmc-shortdesc-fix-results.json', JSON.stringify(results, null, 2))
  const applied = results.filter((r: any) => r.status === 'APPLIED' || r.status === 'WOULD APPLY').length
  const skipped = results.length - applied
  console.log(`${dryRun ? 'Would apply' : 'Applied'} ${applied}, skipped ${skipped} (of ${results.length}).`)
  process.exit(0)
}

run()
