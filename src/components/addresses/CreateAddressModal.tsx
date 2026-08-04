'use client'
import { Button } from '@/components/ui/button'
import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AddressForm } from '@/components/forms/AddressForm'
import { Address } from '@/payload-types'
import { DefaultDocumentIDType } from 'payload'

type Props = {
  addressID?: DefaultDocumentIDType
  initialData?: Partial<Omit<Address, 'country'>> & { country?: string }
  buttonText?: string
  modalTitle?: string
  /** Overrides the dialog's subtitle. */
  description?: string
  callback?: (address: Partial<Address>) => void
  skipSubmission?: boolean
  /** Offer a "save to my account" checkbox instead of always saving. */
  offerSave?: boolean
  disabled?: boolean
}

export const CreateAddressModal: React.FC<Props> = ({
  addressID,
  initialData,
  buttonText = 'Add a new address',
  modalTitle = 'Add a new address',
  description,
  callback,
  skipSubmission,
  offerSave,
  disabled,
}) => {
  const [open, setOpen] = useState(false)
  const handleOpenChange = (state: boolean) => {
    setOpen(state)
  }

  const closeModal = () => {
    setOpen(false)
  }

  const handleCallback = (data: Partial<Address>) => {
    closeModal()

    if (callback) {
      callback(data)
    }
  }

  // The old copy said "This address will be connected to your account" —
  // shown to guests with no account, describing a save that never happened
  // for them. Say what is actually true for the mode the form is in.
  const dialogDescription =
    description ??
    (skipSubmission
      ? 'Used for this order’s delivery and receipt.'
      : 'This address will be saved to your account.')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild disabled={disabled}>
        <Button disabled={disabled} variant={'outline'}>
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <AddressForm
          addressID={addressID}
          initialData={initialData}
          callback={handleCallback}
          offerSave={offerSave}
          skipSubmission={skipSubmission}
        />
      </DialogContent>
    </Dialog>
  )
}
