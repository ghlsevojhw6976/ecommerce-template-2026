import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { companyName, getCompany } from '@/utilities/getCompany'
import { getServerSideURL } from '@/utilities/getURL'

export const revalidate = 3600

/**
 * /llms.txt — a machine-oriented index for AI assistants, generated from the
 * Company global and the live catalogue.
 *
 * Honest expectations: adoption of the llms.txt convention is speculative and
 * most crawlers do not fetch it today. It exists as cheap insurance — a few
 * milliseconds of DB work, zero maintenance (everything derives from
 * settings), and if answer engines start honouring it, every shop on this
 * template is already correct. The real GEO work is the server-rendered
 * product/policy HTML and the structured data, not this file.
 */
export async function GET(): Promise<Response> {
  const baseUrl = getServerSideURL()
  const [company, payload] = await Promise.all([
    getCompany(),
    getPayload({ config: configPromise }),
  ])
  const name = companyName(company)

  const [categories, products] = await Promise.all([
    payload.find({
      collection: 'categories',
      depth: 0,
      limit: 20,
      pagination: false,
      select: { title: true, slug: true },
      where: { parent: { exists: false } },
    }),
    payload.count({
      collection: 'products',
      where: { _status: { equals: 'published' } },
    }),
  ])

  const lines = [
    `# ${name}`,
    '',
    ...(company.tagline ? [`> ${company.tagline}`, ''] : []),
    `US online store with ${products.totalDocs} products. Checkout on our own domain via Stripe; prices in USD, duties included.`,
    ...(typeof company.returnWindowDays === 'number'
      ? [`Returns: ${company.returnWindowDays} days.`]
      : []),
    '',
    '## Key pages',
    '',
    `- [Shop](${baseUrl}/shop): full catalogue`,
    ...categories.docs
      .filter((category) => category.slug && category.title)
      .map((category) => `- [${category.title}](${baseUrl}/shop/${category.slug})`),
    `- [Shipping policy](${baseUrl}/shipping)`,
    `- [Returns policy](${baseUrl}/returns)`,
    `- [FAQ](${baseUrl}/faq)`,
    '',
    '## Machine-readable',
    '',
    `- Sitemap: ${baseUrl}/sitemap.xml`,
    '- Product pages carry schema.org Product JSON-LD (price, availability, ratings, returns).',
    '',
  ]

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
