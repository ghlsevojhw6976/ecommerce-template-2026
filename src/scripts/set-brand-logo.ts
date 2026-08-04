import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * One-off: sets the 40tag logo mark and brand name on the Company global.
 * logoMark also drives the site favicon (root layout generateMetadata).
 *
 *   pnpm exec tsx --env-file=.env src/scripts/set-brand-logo.ts <path-to-logo.png>
 */

const run = async (): Promise<void> => {
  const logoPath = process.argv[2]
  if (!logoPath) {
    console.error('Usage: tsx set-brand-logo.ts <path-to-logo.png>')
    process.exit(1)
  }

  const payload = await getPayload({ config })

  const media = await payload.create({
    collection: 'media',
    data: { alt: '40tag logo' } as never,
    filePath: logoPath,
  })

  await payload.updateGlobal({
    slug: 'company',
    data: { name: '40tag', logoMark: media.id } as never,
  })

  console.log(`Done. media id=${media.id}, company.name=40tag, logoMark set.`)
  process.exit(0)
}

run()
