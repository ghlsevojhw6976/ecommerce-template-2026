'use server'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { orderAccessEmail } from '@/lib/email/templates'
import { sendShopEmail } from '@/lib/email/transport'
import { getCompany } from '@/utilities/getCompany'
import { getServerSideURL } from '@/utilities/getURL'

type SendOrderAccessEmailArgs = {
  email: string
  orderID: string
}

type SendOrderAccessEmailResult = {
  success: boolean
  error?: string
}

/**
 * "Find my order": emails the access link to the address on the order.
 *
 * Always reports success to the caller — whether the order exists, the email
 * matches, or the send failed. Anything else turns this form into an oracle
 * for probing which emails have ordered here.
 */
export async function sendOrderAccessEmail({
  email,
  orderID,
}: SendOrderAccessEmailArgs): Promise<SendOrderAccessEmailResult> {
  const payload = await getPayload({ config: configPromise })

  try {
    const { docs: orders } = await payload.find({
      collection: 'orders',
      where: {
        and: [{ id: { equals: orderID } }, { customerEmail: { equals: email } }],
      },
      limit: 1,
      depth: 0,
    })

    const order = orders[0]

    if (!order || !order.accessToken) {
      return { success: true }
    }

    const company = await getCompany()
    const message = orderAccessEmail({
      order,
      company,
      serverUrl: getServerSideURL(),
      email,
    })

    await sendShopEmail(payload, {
      to: email,
      subject: message.subject,
      html: message.html,
    })

    return { success: true }
  } catch (err) {
    payload.logger.error({ msg: 'Failed to send order access email', err })
    return { success: true }
  }
}
