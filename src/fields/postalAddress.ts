import type { Field } from 'payload'

/**
 * Postal address group, shaped to match the ecommerce plugin's own address
 * fields on orders so the two can be copied between each other directly.
 */
export const postalAddress = ({
  name,
  label,
  description,
}: {
  name: string
  label: string
  description?: string
}): Field => ({
  name,
  type: 'group',
  label,
  admin: { description },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'firstName', type: 'text', admin: { width: '50%' } },
        { name: 'lastName', type: 'text', admin: { width: '50%' } },
      ],
    },
    { name: 'company', type: 'text' },
    { name: 'addressLine1', type: 'text' },
    { name: 'addressLine2', type: 'text' },
    {
      type: 'row',
      fields: [
        { name: 'city', type: 'text', admin: { width: '50%' } },
        { name: 'state', type: 'text', admin: { width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'postalCode', type: 'text', admin: { width: '50%' } },
        {
          name: 'country',
          type: 'text',
          admin: {
            width: '50%',
            description: 'ISO 3166-1 alpha-2 (e.g. LT). Stripe rejects anything else.',
          },
        },
      ],
    },
    { name: 'phone', type: 'text' },
    { name: 'title', type: 'text', admin: { hidden: true } },
  ],
})

export type PostalAddress = {
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
  title?: string | null
}

/** True when there is enough here to actually put a parcel on a van. */
export const isDispatchable = (address?: PostalAddress | null): boolean =>
  Boolean(address?.addressLine1 && address?.city && address?.postalCode && address?.country)
