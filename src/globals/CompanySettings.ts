import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { revalidateEverything } from '@/hooks/revalidateStorefront'

/**
 * Company — the single source of truth for who this shop actually is.
 *
 * This is the other half of the reusability story. The palette makes a shop
 * *look* different; this makes it *be* a different business. Every appearance
 * of the name, address, phone, returns window or registration number across the
 * storefront and the policy pages reads from here, so launching a new shop is
 * filling in one form rather than hunting hardcoded strings through templates.
 *
 * Policy pages reference these with `{{company.*}}` placeholders — see
 * src/utilities/companyPlaceholders.ts.
 *
 * Legally this matters too: EU/UK consumer law and most US states require a
 * trader's identity, geographic address and contact details to be readily
 * available. Hardcoding them per shop is how one ends up shipping with the
 * previous client's address still in the footer.
 */
export const CompanySettings: GlobalConfig = {
  slug: 'company',
  hooks: {
    afterChange: [revalidateEverything],
  },
  label: 'Company',
  access: {
    // Public read: the header, footer and policy pages need this on every request.
    read: () => true,
    update: adminOnly,
  },
  admin: {
    group: 'Settings',
    description: 'Used sitewide — header, footer, contact, returns and terms pages.',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        // ---------------------------------------------------------------
        {
          label: 'Identity',
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              defaultValue: 'Your Shop',
              admin: {
                description: 'Trading name. Appears in the header, footer, emails and page titles.',
              },
            },
            {
              name: 'legalName',
              type: 'text',
              admin: {
                description:
                  'Registered entity, e.g. "Acme Housewares LLC". Used in terms and conditions where the trading name is not sufficient. Falls back to the trading name.',
              },
            },
            {
              name: 'brandWordmark',
              type: 'text',
              admin: {
                description:
                  'Text shown next to the logo mark in the header, e.g. "yourshop.com". Falls back to the trading name. Header only — titles and emails keep using the trading name.',
              },
            },
            { name: 'tagline', type: 'text' },
            {
              name: 'foundedYear',
              type: 'number',
              admin: {
                description: 'Used for the copyright range in the footer.',
              },
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Logo',
          description:
            'Both variants are rendered and swapped with CSS, so there is no flash on load or when the theme changes.',
          fields: [
            {
              name: 'logoLight',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description:
                  'Shown on LIGHT backgrounds — so this is usually the dark version of your mark. SVG preferred.',
              },
            },
            {
              name: 'logoDark',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description:
                  'Shown on DARK backgrounds. Leave blank to reuse the light logo inverted.',
              },
            },
            {
              name: 'logoMark',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description: 'Square icon for favicons and tight spaces.',
              },
            },
            {
              name: 'logoHeight',
              type: 'number',
              defaultValue: 28,
              min: 12,
              max: 80,
              admin: { description: 'Rendered height in the header, in pixels.' },
            },
            {
              name: 'ogImage',
              type: 'upload',
              relationTo: 'media',
              admin: { description: 'Social sharing image, 1200×630.' },
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Contact',
          description:
            'Real, reachable contact details. High-value buyers check that a human exists before spending — and most consumer law requires them.',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'email', type: 'email', admin: { width: '50%' } },
                {
                  name: 'supportEmail',
                  type: 'email',
                  admin: { width: '50%', description: 'Falls back to the general email.' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'phone', type: 'text', admin: { width: '50%' } },
                {
                  name: 'supportHours',
                  type: 'text',
                  admin: { width: '50%', description: 'e.g. "Mon–Fri, 9am–5pm ET".' },
                },
              ],
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Address',
          fields: [
            { name: 'addressLine1', type: 'text' },
            { name: 'addressLine2', type: 'text' },
            {
              type: 'row',
              fields: [
                { name: 'city', type: 'text', admin: { width: '50%' } },
                { name: 'region', type: 'text', admin: { width: '50%', description: 'State / province.' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'postalCode', type: 'text', admin: { width: '50%' } },
                {
                  name: 'country',
                  type: 'text',
                  maxLength: 2,
                  admin: { width: '50%', description: 'ISO 3166-1 alpha-2, e.g. US.' },
                },
              ],
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Returns address',
          description:
            'Where customers physically send returns. Often not the trading address — a shop dispatching from Europe usually wants a domestic address in its main market, because an international return is expensive enough to stop people buying in the first place.',
          fields: [
            {
              name: 'returnsAddressSameAsAbove',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                description:
                  'Uncheck to use a separate returns address — a US facility, a 3PL, or a supplier.',
              },
            },
            {
              name: 'returnsLocation',
              type: 'group',
              label: 'Separate returns address',
              admin: {
                condition: (_, siblingData) => siblingData?.returnsAddressSameAsAbove === false,
              },
              fields: [
                {
                  name: 'recipient',
                  type: 'text',
                  admin: {
                    description:
                      'Who the parcel is addressed to, e.g. “Acme Returns Dept”. Not always the company name — a 3PL will have its own.',
                  },
                },
                { name: 'addressLine1', type: 'text' },
                { name: 'addressLine2', type: 'text' },
                {
                  type: 'row',
                  fields: [
                    { name: 'city', type: 'text', admin: { width: '50%' } },
                    {
                      name: 'region',
                      type: 'text',
                      admin: { width: '50%', description: 'State / province.' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'postalCode', type: 'text', admin: { width: '50%' } },
                    {
                      name: 'country',
                      type: 'text',
                      maxLength: 2,
                      admin: { width: '50%', description: 'ISO 3166-1 alpha-2, e.g. US.' },
                    },
                  ],
                },
                {
                  name: 'phone',
                  type: 'text',
                  admin: { description: 'Optional. Some carriers require one on the label.' },
                },
                {
                  name: 'instructions',
                  type: 'textarea',
                  admin: {
                    description:
                      'Anything the customer must do — e.g. “Write your RMA number on the outside of the parcel.” Shown with the address on the returns page.',
                  },
                },
              ],
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Registration',
          description: 'Appears in terms and conditions and, in many jurisdictions, the footer.',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'companyNumber', type: 'text', admin: { width: '50%' } },
                {
                  name: 'taxId',
                  type: 'text',
                  admin: { width: '50%', description: 'VAT number, EIN, etc.' },
                },
              ],
            },
            {
              name: 'jurisdiction',
              type: 'text',
              admin: {
                description:
                  'Governing law for the terms, e.g. "the State of Delaware, USA". Do not leave this generic — it is the clause that decides where disputes are heard.',
              },
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Policies',
          description:
            'Single source of truth for these values. The product page, returns policy and terms all read them from here, so they can never disagree with each other.',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'returnWindowDays',
                  type: 'number',
                  defaultValue: 30,
                  min: 0,
                  admin: { width: '50%', description: '30 days is the US baseline expectation.' },
                },
                {
                  name: 'defaultWarrantyMonths',
                  type: 'number',
                  min: 0,
                  admin: {
                    width: '50%',
                    description:
                      '⚠️ Currently unused — no page reads this field. All warranty/guarantee copy was consolidated to the single 40tag Guarantee (src/lib/commerce/guarantee.ts) on 2026-08-12, since 40tag is not an authorized retailer for the brands it sells and cannot promise per-product manufacturer warranty terms. Left in the schema rather than deleted (a destructive change); safe to remove properly if it stays unused.',
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'freeShippingThreshold',
                  type: 'number',
                  min: 0,
                  admin: {
                    width: '50%',
                    description: 'In MINOR units (cents). Blank means free shipping always.',
                  },
                },
                {
                  name: 'processingTimeDays',
                  type: 'number',
                  defaultValue: 2,
                  min: 0,
                  admin: { width: '50%', description: 'Business days before dispatch.' },
                },
              ],
            },
            {
              name: 'returnsShippingPaidBy',
              type: 'select',
              defaultValue: 'merchant',
              options: [
                { label: 'We pay return shipping', value: 'merchant' },
                { label: 'Customer pays return shipping', value: 'customer' },
              ],
              admin: {
                description:
                  'Free returns materially reduce hesitation on high-value orders — 15% of shoppers abandon over an unsatisfactory return policy.',
              },
            },
            {
              name: 'reviewsEnabled',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                description:
                  'Sitewide switch. Off hides the review list, the star rating, and the review count everywhere they appear (product pages, shop grid cards, the homepage hero) and drops aggregateRating from product structured data — not just the review list on its own, since a star badge with nothing behind it reads worse than no rating at all. Reviews themselves are never deleted, only unrendered. Saving this triggers a full site revalidation.',
              },
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Shipping & Customs',
          description:
            'Cross-border disclosure shown on product pages and policy pages. One master switch turns it off everywhere.',
          fields: [
            {
              name: 'shippingDisclaimerEnabled',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                description:
                  'Master switch. When off, the disclaimer disappears from every page and the {{company.shippingDisclaimer}} placeholder resolves to nothing — no empty headings, no stray braces.',
              },
            },
            {
              type: 'row',
              admin: {
                condition: (_, siblingData) => siblingData?.shippingDisclaimerEnabled === true,
              },
              fields: [
                {
                  name: 'shipsFrom',
                  type: 'text',
                  defaultValue: 'Germany',
                  admin: { width: '50%', description: 'Where orders dispatch from.' },
                },
                {
                  name: 'shipsTo',
                  type: 'text',
                  defaultValue: 'the United States',
                  admin: { width: '50%', description: 'Primary destination market.' },
                },
              ],
            },
            {
              type: 'row',
              admin: {
                condition: (_, siblingData) => siblingData?.shippingDisclaimerEnabled === true,
              },
              fields: [
                {
                  name: 'deliveryMinDays',
                  type: 'number',
                  defaultValue: 7,
                  min: 0,
                  admin: { width: '50%', description: 'Transit days after dispatch.' },
                },
                {
                  name: 'deliveryMaxDays',
                  type: 'number',
                  defaultValue: 14,
                  min: 0,
                  admin: {
                    width: '50%',
                    description:
                      'Quote the realistic upper bound. Understating delivery converts slightly better and produces support load, refunds and chargebacks.',
                  },
                },
              ],
            },
            {
              name: 'customsHandling',
              type: 'select',
              defaultValue: 'unspecified',
              admin: {
                condition: (_, siblingData) => siblingData?.shippingDisclaimerEnabled === true,
                description:
                  'The US suspended its $800 de minimis exemption for all origins in August 2025, so duties now apply to essentially every shipment regardless of value. Whoever pays them, the customer has to be told before they buy — an unexpected bill at the door is the top cause of refused deliveries and chargebacks on cross-border orders.',
              },
              options: [
                {
                  label: 'We pay duties and taxes (DDP) — no charge on delivery',
                  value: 'ddp',
                },
                {
                  label: 'Customer pays duties and taxes on delivery (DDU/DAP)',
                  value: 'ddu',
                },
                { label: 'Do not mention customs', value: 'unspecified' },
              ],
            },
            {
              name: 'shippingDisclaimerOverride',
              type: 'textarea',
              admin: {
                condition: (_, siblingData) => siblingData?.shippingDisclaimerEnabled === true,
                description:
                  'Optional. Replaces the generated sentence entirely. Leave blank to have it built from the values above, which keeps it consistent with the product page and policy pages.',
              },
            },
          ],
        },

        // ---------------------------------------------------------------
        {
          label: 'Social',
          fields: [
            {
              name: 'socialLinks',
              type: 'array',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'platform',
                      type: 'select',
                      required: true,
                      options: ['Instagram', 'Facebook', 'X', 'YouTube', 'TikTok', 'Pinterest', 'LinkedIn'].map(
                        (p) => ({ label: p, value: p.toLowerCase() }),
                      ),
                      admin: { width: '40%' },
                    },
                    { name: 'url', type: 'text', required: true, admin: { width: '60%' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
