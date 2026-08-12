import { getPayload } from 'payload'
import config from '@payload-config'

import { seedPolicies } from '@/endpoints/seed/policies'

/**
 * Re-seed only terms + faq after their SOURCE copy changed (the Warranties
 * section / "Is there a warranty?" answer, consolidated to the 40tag
 * Guarantee, 2026-08-12). Deliberately scoped with `only` — the HTTP route
 * (/next/policies/seed) only exposes a blunt all-5-pages `overwrite`, which
 * would risk clobbering hand-edited copy on returns/shipping/privacy that
 * this change has nothing to do with.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/reseedTermsAndFaq.ts
 */

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const result = await seedPolicies({ payload, overwrite: true, only: ['terms', 'faq'] })
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

run()
