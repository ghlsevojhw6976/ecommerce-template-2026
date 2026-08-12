import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * One-off: sets Company.reviewsEnabled. Booting Payload here also pushes
 * the additive schema change (the reviewsEnabled column doesn't exist yet —
 * `generate:types` only compiles types, it doesn't touch the DB).
 *
 *   pnpm exec tsx --env-file=.env src/scripts/setReviewsEnabled.ts false
 */

const run = async (): Promise<void> => {
  const value = process.argv[2] !== 'false'
  const payload = await getPayload({ config })

  await payload.updateGlobal({
    slug: 'company',
    data: { reviewsEnabled: value } as never,
  })

  console.log(`reviewsEnabled set to ${value}.`)
  process.exit(0)
}

run()
