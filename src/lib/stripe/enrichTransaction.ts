import type { CollectionAfterChangeHook } from 'payload'

import { isDispatchable, type PostalAddress } from '@/fields/postalAddress'
import { getStripe } from './client'

/**
 * Runs once, right after a transaction is created, and fixes three gaps in the
 * plugin's checkout.
 *
 * ── 1. The dispatch address was only ever in Stripe metadata ────────────
 * `initiatePayment` stores `billingAddress` on the transaction but NOT
 * `shippingAddress` — that lives solely in `paymentIntent.metadata` as a JSON
 * string. Stripe caps metadata values at 500 characters, and metadata is not a
 * database. If it is ever absent, the order is created with no address and
 * cannot be shipped. We copy it into Postgres, where it belongs.
 *
 * ── 2. The PaymentIntent had no native `shipping` ───────────────────────
 * Stripe Radar uses shipping and billing details to score fraud, and shipping
 * data is core evidence when defending a chargeback. An address buried in
 * metadata is invisible to both. Setting `shipping` properly makes it count.
 *
 * ── 3. The Stripe Customer was created with only an email ───────────────
 * No name, no phone, no address — so the dashboard is near-useless for support
 * and Radar has less to work with. We fill it in.
 *
 * All of this is best-effort: a Stripe outage must never roll back a
 * transaction the customer has already started paying for. Failures are logged,
 * not thrown.
 */

const parseAddress = (raw?: string): PostalAddress | undefined => {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as PostalAddress) : undefined
  } catch {
    return undefined
  }
}

/** Our address shape -> Stripe's. Returns null when Stripe would reject it. */
export const toStripeShipping = (address?: PostalAddress | null, fallbackName?: string) => {
  if (!address?.addressLine1) return null

  const name =
    [address.firstName, address.lastName].filter(Boolean).join(' ').trim() ||
    address.company ||
    fallbackName

  // Stripe requires both a name and line1 on a shipping object.
  if (!name) return null

  return {
    name,
    ...(address.phone ? { phone: address.phone } : {}),
    address: {
      line1: address.addressLine1,
      ...(address.addressLine2 ? { line2: address.addressLine2 } : {}),
      ...(address.city ? { city: address.city } : {}),
      ...(address.state ? { state: address.state } : {}),
      ...(address.postalCode ? { postal_code: address.postalCode } : {}),
      // Stripe requires ISO 3166-1 alpha-2 and errors on anything longer.
      ...(address.country && address.country.length === 2
        ? { country: address.country.toUpperCase() }
        : {}),
    },
  }
}

export const enrichStripeTransaction: CollectionAfterChangeHook = async ({
  context,
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc
  // Set when we update the transaction below — prevents re-entering this hook.
  if (context?.skipStripeEnrichment) return doc

  const paymentIntentID = (doc as Record<string, any>)?.stripe?.paymentIntentID
  if (!paymentIntentID) return doc

  const stripe = getStripe()
  if (!stripe) return doc

  const { payload } = req

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentID)

    const shippingAddress = parseAddress(paymentIntent.metadata?.shippingAddress)
    const billingAddress =
      ((doc as Record<string, any>).billingAddress as PostalAddress | undefined) ??
      parseAddress(paymentIntent.metadata?.billingAddress)

    // Shipping is what we dispatch to; fall back to billing if the customer
    // only gave one address.
    const dispatchTo = isDispatchable(shippingAddress)
      ? shippingAddress
      : isDispatchable(billingAddress)
        ? billingAddress
        : shippingAddress ?? billingAddress

    // ---- 1. Persist the address in our database --------------------------
    if (dispatchTo) {
      await payload.update({
        collection: 'transactions',
        id: (doc as Record<string, any>).id,
        data: { shippingAddress: dispatchTo } as never,
        context: { skipStripeEnrichment: true },
        req,
      })
    } else {
      payload.logger.warn(
        { transactionId: (doc as Record<string, any>).id, paymentIntentID },
        'Transaction created with no usable shipping address — this order cannot be dispatched',
      )
    }

    // ---- 2. Give Stripe the shipping details natively --------------------
    const customerEmail = (doc as Record<string, any>).customerEmail as string | undefined
    const shipping = toStripeShipping(dispatchTo, customerEmail)

    if (shipping) {
      await stripe.paymentIntents.update(paymentIntentID, { shipping })
    }

    // ---- 3. Flesh out the Stripe customer --------------------------------
    const customerID = (doc as Record<string, any>)?.stripe?.customerID
    if (customerID && shipping) {
      await stripe.customers.update(customerID, {
        name: shipping.name,
        ...(shipping.phone ? { phone: shipping.phone } : {}),
        address: shipping.address,
        ...(dispatchTo ? { shipping } : {}),
      })
    }
  } catch (error) {
    // Never let this break a payment already in flight.
    payload.logger.error(
      { err: error, transactionId: (doc as Record<string, any>).id, paymentIntentID },
      'Failed to enrich Stripe transaction (payment itself is unaffected)',
    )
  }

  return doc
}
