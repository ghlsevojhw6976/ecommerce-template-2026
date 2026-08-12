import { getPayload } from 'payload'
import config from '@payload-config'

import { seedPolicies } from '@/endpoints/seed/policies'

/**
 * Re-seed only shipping + faq after their SOURCE copy changed (shipping is
 * unconditionally free, no threshold — 2026-08-13). Scoped with `only` for
 * the same reason as reseedTermsAndFaq.ts: avoid touching returns/terms/privacy.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/reseedShippingAndFaq.ts
 */

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const result = await seedPolicies({ payload, overwrite: true, only: ['shipping', 'faq'] })
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

run()
