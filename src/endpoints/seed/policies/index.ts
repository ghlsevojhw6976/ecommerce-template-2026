import type { Payload, PayloadRequest } from 'payload'

import { doc, h } from './lexical'
import { seedContact } from './contact'
import { faqPage } from './faq'
import { privacyPage } from './privacy'
import { returnsPage } from './returns'
import { shippingPage } from './shipping'
import { termsPage } from './terms'

/**
 * Boilerplate pages every shop needs, written once.
 *
 * This is the reusable-content half of the template. The copy is generic; the
 * specifics — name, address, returns window, jurisdiction — arrive as
 * `{{company.*}}` placeholders resolved at render from Company settings. So a
 * new shop launches with complete, coherent, internally consistent policy pages
 * instead of lorem ipsum or, worse, the previous client's details.
 *
 * ⚠️ Terms and Privacy are researched starting points, not legal advice. Both
 * carry review notes in their source files.
 */

export const POLICY_PAGES = [returnsPage, shippingPage, faqPage, privacyPage, termsPage]

export type SeedPoliciesResult = {
  created: string[]
  skipped: string[]
}

/**
 * Installs the policy pages.
 *
 * Existing pages are skipped rather than overwritten — running this twice, or
 * on a shop that has already customised its returns policy, must never destroy
 * edited copy. Pass `overwrite` to force it.
 */
export const seedPolicies = async ({
  payload,
  req,
  overwrite = false,
  only,
}: {
  payload: Payload
  req?: PayloadRequest
  overwrite?: boolean
  /**
   * Restrict to specific slugs — for re-seeding a page whose SOURCE copy
   * changed without touching pages a shop may have hand-edited.
   */
  only?: string[]
}): Promise<SeedPoliciesResult> => {
  const created: string[] = []
  const skipped: string[] = []

  const pages = only ? POLICY_PAGES.filter((page) => only.includes(page.slug)) : POLICY_PAGES

  for (const page of pages) {
    const existing = await payload.find({
      collection: 'pages',
      depth: 0,
      limit: 1,
      where: { slug: { equals: page.slug } },
      ...(req ? { req } : {}),
    })

    const current = existing.docs[0]

    if (current && !overwrite) {
      skipped.push(page.slug)
      continue
    }

    const data = {
      title: page.title,
      slug: page.slug,
      _status: 'published',
      // Without a hero these render as headless documents — no visible title
      // and no <h1> for search engines.
      hero: {
        type: 'lowImpact',
        richText: doc([h('h2', page.title)]),
      },
      layout: page.layout,
      meta: {
        title: page.title,
        description: `${page.title} — read before you order.`,
      },
    } as never

    // Pages carry a revalidatePath afterChange hook that needs Next's static
    // generation store. Seeding runs outside a request (CLI, or a deploy step),
    // so revalidation is disabled here — the same convention the template's own
    // seeder uses.
    const context = { disableRevalidate: true }

    if (current) {
      await payload.update({
        collection: 'pages',
        id: current.id,
        data,
        context,
        ...(req ? { req } : {}),
      })
    } else {
      await payload.create({ collection: 'pages', data, context, ...(req ? { req } : {}) })
    }

    created.push(page.slug)
  }

  // The contact page carries a form, so it is built separately rather than
  // from static layout data. Respect the `only` filter — an overwrite scoped
  // to other pages must not regenerate contact.
  if (!only || only.includes('contact')) {
    const contactResult = await seedContact({ payload, overwrite })
    if (contactResult === 'skipped') skipped.push('contact')
    else created.push('contact')
  }

  return { created, skipped }
}
