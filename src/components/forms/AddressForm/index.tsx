'use client'
import React, { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useAddresses } from '@payloadcms/plugin-ecommerce/client/react'
import { Address, Config } from '@/payload-types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { SUPPORTED_COUNTRIES, STATE_REQUIRED_COUNTRIES } from './constants'
import { Button } from '@/components/ui/button'
import { deepMergeSimple } from 'payload/shared'
import { FormError } from '@/components/forms/FormError'
import { FormItem } from '@/components/forms/FormItem'

type AddressFormValues = {
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
}

type Props = {
  addressID?: Config['db']['defaultIDType']
  initialData?: Omit<Address, 'country' | 'id' | 'updatedAt' | 'createdAt'> & { country?: string }
  callback?: (data: Partial<Address>) => void
  /**
   * If true, the form will not submit to the API.
   */
  skipSubmission?: boolean
  /**
   * With skipSubmission, offer an opt-in "save to my account" checkbox.
   * Saving is a favour to the customer's next order, not a toll on this one.
   */
  offerSave?: boolean
  submitLabel?: string
}

/**
 * The address form, sized for a US consumer purchase.
 *
 * What is deliberately NOT here: the Title honorific dropdown (seven options,
 * zero of which a carrier or Stripe ever reads) and a 40-country dropdown on
 * a shop that ships to one country. Every removed field is a field a $500
 * customer cannot mistype and abandon over.
 */
export const AddressForm: React.FC<Props> = ({
  addressID,
  initialData,
  callback,
  skipSubmission,
  offerSave,
  submitLabel = 'Use this address',
}) => {
  const singleCountry = SUPPORTED_COUNTRIES.length === 1 ? SUPPORTED_COUNTRIES[0] : undefined

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<AddressFormValues>({
    defaultValues: {
      ...initialData,
      country: initialData?.country || singleCountry?.value,
    },
  })

  const [saveToAccount, setSaveToAccount] = useState(false)

  const { createAddress, updateAddress } = useAddresses()

  const selectedCountry = watch('country') || singleCountry?.value || ''
  const stateRequired = STATE_REQUIRED_COUNTRIES.has(selectedCountry)

  const onSubmit = useCallback(
    async (data: AddressFormValues) => {
      const newData = deepMergeSimple(initialData || {}, data)

      if (!skipSubmission) {
        if (addressID) {
          await updateAddress(addressID, newData)
        } else {
          await createAddress(newData)
        }
      } else if (offerSave && saveToAccount) {
        // Opt-in save. A failure here must not lose the checkout: the address
        // is already on its way into the order via the callback.
        await createAddress(newData).catch(() => undefined)
      }

      if (callback) {
        callback(newData)
      }
    },
    [
      initialData,
      skipSubmission,
      offerSave,
      saveToAccount,
      callback,
      addressID,
      updateAddress,
      createAddress,
    ],
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <FormItem>
            <Label htmlFor="firstName">First name*</Label>
            <Input
              id="firstName"
              autoComplete="given-name"
              {...register('firstName', { required: 'First name is required.' })}
            />
            {errors.firstName && <FormError message={errors.firstName.message} />}
          </FormItem>

          <FormItem>
            <Label htmlFor="lastName">Last name*</Label>
            <Input
              autoComplete="family-name"
              id="lastName"
              {...register('lastName', { required: 'Last name is required.' })}
            />
            {errors.lastName && <FormError message={errors.lastName.message} />}
          </FormItem>
        </div>

        <FormItem>
          <Label htmlFor="addressLine1">Street address*</Label>
          <Input
            id="addressLine1"
            autoComplete="address-line1"
            {...register('addressLine1', { required: 'Street address is required.' })}
          />
          {errors.addressLine1 && <FormError message={errors.addressLine1.message} />}
        </FormItem>

        <FormItem>
          <Label htmlFor="addressLine2">Apartment, suite, unit (optional)</Label>
          <Input id="addressLine2" autoComplete="address-line2" {...register('addressLine2')} />
          {errors.addressLine2 && <FormError message={errors.addressLine2.message} />}
        </FormItem>

        <div className="flex flex-col md:flex-row gap-4">
          <FormItem>
            <Label htmlFor="city">City*</Label>
            <Input
              id="city"
              autoComplete="address-level2"
              {...register('city', { required: 'City is required.' })}
            />
            {errors.city && <FormError message={errors.city.message} />}
          </FormItem>

          <FormItem>
            <Label htmlFor="state">{stateRequired ? 'State*' : 'State / province'}</Label>
            <Input
              id="state"
              autoComplete="address-level1"
              {...register('state', {
                required: stateRequired ? 'State is required.' : false,
              })}
            />
            {errors.state && <FormError message={errors.state.message} />}
          </FormItem>

          <FormItem>
            <Label htmlFor="postalCode">ZIP code*</Label>
            <Input
              id="postalCode"
              autoComplete="postal-code"
              {...register('postalCode', { required: 'ZIP code is required.' })}
            />
            {errors.postalCode && <FormError message={errors.postalCode.message} />}
          </FormItem>
        </div>

        {singleCountry ? (
          <FormItem>
            <Label>Country</Label>
            <p className="text-sm text-muted-foreground">{singleCountry.label}</p>
            <input type="hidden" {...register('country')} value={singleCountry.value} />
          </FormItem>
        ) : (
          <FormItem>
            <Label htmlFor="country">Country*</Label>

            <Select
              {...register('country', {
                required: 'Country is required.',
              })}
              onValueChange={(value) => {
                setValue('country', value, { shouldValidate: true })
              }}
              required
              defaultValue={initialData?.country || ''}
            >
              <SelectTrigger id="country" className="w-full">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_COUNTRIES.map((country) => (
                  <SelectItem key={country.value} value={country.value}>
                    {country.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.country && <FormError message={errors.country.message} />}
          </FormItem>
        )}

        <FormItem>
          <Label htmlFor="phone">Phone (for delivery updates)</Label>
          <Input type="tel" id="phone" autoComplete="tel" {...register('phone')} />
          {errors.phone && <FormError message={errors.phone.message} />}
        </FormItem>

        <FormItem>
          <Label htmlFor="company">Company (optional)</Label>
          <Input id="company" autoComplete="organization" {...register('company')} />
          {errors.company && <FormError message={errors.company.message} />}
        </FormItem>

        {skipSubmission && offerSave && (
          <div className="flex items-center gap-3">
            <Checkbox
              checked={saveToAccount}
              id="saveToAccount"
              onCheckedChange={(state) => setSaveToAccount(state === true)}
            />
            <Label htmlFor="saveToAccount">Save this address to my account for next time</Label>
          </div>
        )}
      </div>

      <Button type="submit">{skipSubmission ? submitLabel : 'Save address'}</Button>
    </form>
  )
}
