import type { Payload } from 'payload'

import { doc, h, p } from './lexical'

/**
 * Contact page and its form.
 *
 * Two jobs. Commercially, a reachable human is a trust signal — at higher price
 * points buyers check that a real business exists before spending, and "we
 * answer" converts. Legally, most consumer regimes require a trader's contact
 * details to be readily available.
 *
 * The form is deliberately short. Every additional field costs completions, and
 * the only ones that genuinely speed up an answer are: who you are, how to
 * reply, what it is about, and the order number if there is one.
 */

const text = (value: string) => ({
  type: 'text' as const,
  detail: 0,
  format: 0,
  mode: 'normal' as const,
  style: '',
  text: value,
  version: 1,
})

export const contactFormFields = [
  {
    blockName: 'Name',
    blockType: 'text' as const,
    name: 'name',
    label: 'Your name',
    required: true,
    width: 50,
  },
  {
    blockName: 'Email',
    blockType: 'email' as const,
    name: 'email',
    label: 'Email',
    required: true,
    width: 50,
  },
  {
    blockName: 'Order number',
    blockType: 'text' as const,
    name: 'orderNumber',
    label: 'Order number (if you have one)',
    required: false,
    width: 50,
  },
  {
    blockName: 'Subject',
    blockType: 'select' as const,
    name: 'subject',
    label: 'What is it about?',
    required: true,
    width: 50,
    defaultValue: 'presale',
    options: [
      { label: 'A question before I buy', value: 'presale' },
      { label: 'An existing order', value: 'order' },
      { label: 'A return or refund', value: 'return' },
      { label: 'Something else', value: 'other' },
    ],
  },
  {
    blockName: 'Message',
    blockType: 'textarea' as const,
    name: 'message',
    label: 'Message',
    required: true,
    width: 100,
  },
]

/**
 * Creates (or updates) the contact form and its page.
 *
 * The notification address is read from Company settings rather than hardcoded,
 * so a new shop's enquiries do not silently go to the previous shop's inbox.
 */
export const seedContact = async ({
  payload,
  overwrite = false,
}: {
  payload: Payload
  overwrite?: boolean
}): Promise<'created' | 'updated' | 'skipped'> => {
  const company = (await payload.findGlobal({ slug: 'company', depth: 0 }).catch(() => ({}))) as {
    supportEmail?: string | null
    email?: string | null
    name?: string | null
  }

  const notifyTo = company.supportEmail || company.email || ''
  const fromName = company.name || 'Your Shop'

  const existingPage = await payload.find({
    collection: 'pages',
    depth: 0,
    limit: 1,
    where: { slug: { equals: 'contact' } },
  })

  if (existingPage.docs[0] && !overwrite) return 'skipped'

  const existingForm = await payload.find({
    collection: 'forms',
    depth: 0,
    limit: 1,
    where: { title: { equals: 'Contact' } },
  })

  const formData = {
    title: 'Contact',
    fields: contactFormFields,
    submitButtonLabel: 'Send message',
    confirmationType: 'message',
    confirmationMessage: doc([
      h('h3', 'Thanks — we have got it.'),
      p(
        'We answer during business hours, usually the same day. If it is about an existing order, having the order number to hand speeds things up.',
      ),
    ]),
    // Only wire up notifications once there is somewhere to send them.
    ...(notifyTo
      ? {
          emails: [
            {
              emailTo: notifyTo,
              emailFrom: notifyTo,
              subject: `New enquiry via ${fromName}`,
              message: doc([
                p('A new message was submitted through the contact form.'),
                p('{{name}} ({{email}}) — {{subject}}'),
                p('Order: {{orderNumber}}'),
                p('{{message}}'),
              ]),
            },
          ],
        }
      : {}),
  } as never

  const form = existingForm.docs[0]
    ? await payload.update({
        collection: 'forms',
        id: existingForm.docs[0].id,
        data: formData,
      })
    : await payload.create({ collection: 'forms', data: formData })

  const pageData = {
    title: 'Contact',
    slug: 'contact',
    _status: 'published',
    hero: { type: 'lowImpact', richText: doc([h('h2', 'Contact')]) },
    layout: [
      {
        blockType: 'formBlock',
        enableIntro: true,
        form: form.id,
        introContent: doc([
          p(
            'A person reads every message. If it is about an order, include the order number and we can usually answer in one reply rather than three.',
          ),
        ]),
      },
      {
        blockType: 'contactDetails',
        heading: 'Other ways to reach us',
        intro:
          'Prefer to call or write? Everything below reaches the same team as the form.',
        showReturnsAddress: true,
      },
    ],
    meta: {
      title: 'Contact',
      description: 'Get in touch — a person answers.',
    },
  } as never

  const context = { disableRevalidate: true }

  if (existingPage.docs[0]) {
    await payload.update({
      collection: 'pages',
      id: existingPage.docs[0].id,
      data: pageData,
      context,
    })
    return 'updated'
  }

  await payload.create({ collection: 'pages', data: pageData, context })
  return 'created'
}
