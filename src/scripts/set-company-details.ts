import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * One-off: sets registered company details on the Company global, sourced
 * from Companies House (company number 12886969).
 *
 *   pnpm exec tsx --env-file=.env src/scripts/set-company-details.ts
 */

const run = async (): Promise<void> => {
  const payload = await getPayload({ config })

  await payload.updateGlobal({
    slug: 'company',
    data: {
      legalName: 'Trade In Tech Ltd',
      companyNumber: '12886969',
      jurisdiction: 'England and Wales',
      foundedYear: 2020,
      addressLine1: 'Office 2, 82 Longbridge Road',
      city: 'Barking',
      region: 'Essex',
      postalCode: 'IG11 8SF',
      country: 'GB',
      email: 'info@40tag.com',
    } as never,
  })

  console.log('Done. Company registration + contact details set.')
  process.exit(0)
}

run()
