import type { Order } from '@/payload-types'
import type { Metadata } from 'next'

import { Price } from '@/components/Price'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/utilities/formatDateTime'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeftIcon } from 'lucide-react'
import { ProductItem } from '@/components/ProductItem'
import { ProductGridItem } from '@/components/ProductGridItem'
import { getPostPurchase } from '@/lib/commerce/recommendations'
import { headers as getHeaders } from 'next/headers.js'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { OrderStatus } from '@/components/OrderStatus'
import { AddressItem } from '@/components/addresses/AddressItem'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ email?: string; accessToken?: string }>
}

export default async function Order({ params, searchParams }: PageProps) {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  const { id } = await params
  const { email = '', accessToken = '' } = await searchParams

  let order: Order | null = null

  try {
    // Two independent credentials, either sufficient:
    //  1. The emailed link (accessToken + matching email) — PUBLIC, and it
    //     must keep working while logged in as anyone. The earlier version
    //     ignored the token whenever a session existed, so an admin (or any
    //     signed-in customer) clicking a guest confirmation link got a 404.
    //  2. Being signed in as the order's customer.
    const tokenAttempt = Boolean(accessToken && email)

    const {
      docs: [orderResult],
    } = await payload.find({
      collection: 'orders',
      user,
      overrideAccess: tokenAttempt || !user,
      depth: 2,
      where: {
        and: [
          {
            id: {
              equals: id,
            },
          },
          ...(tokenAttempt
            ? [
                { accessToken: { equals: accessToken } },
                { customerEmail: { equals: email } },
              ]
            : user
              ? [
                  {
                    customer: {
                      equals: user.id,
                    },
                  },
                ]
              : [
                  // No token, no session — match nothing rather than leak.
                  { accessToken: { equals: '__none__' } },
                ]),
        ],
      },
      select: {
        amount: true,
        currency: true,
        items: true,
        customerEmail: true,
        customer: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        shippingAddress: true,
      },
    })

    const canAccessAsGuest =
      tokenAttempt &&
      orderResult &&
      orderResult.customerEmail &&
      orderResult.customerEmail === email
    const canAccessAsUser =
      user &&
      orderResult &&
      orderResult.customer &&
      (typeof orderResult.customer === 'object'
        ? orderResult.customer.id
        : orderResult.customer) === user.id

    if (orderResult && (canAccessAsGuest || canAccessAsUser)) {
      order = orderResult
    }
  } catch (error) {
    console.error(error)
  }

  if (!order) {
    notFound()
  }

  // Purchased product IDS → post-purchase suggestions. Ids, not the resolved
  // objects: relation-resolved products are stripped by defaultPopulate and
  // lack the category data the engine needs.
  const purchasedIds = (order.items ?? [])
    .map((item) =>
      item.product && typeof item.product === 'object' ? item.product.id : item.product,
    )
    .filter((id): id is number => typeof id === 'number')

  const recommendations = await getPostPurchase({ payload, productIds: purchasedIds })

  return (
    <div className="">
      <div className="flex gap-8 justify-between items-center mb-6">
        {user ? (
          <div className="flex gap-4">
            <Button asChild variant="ghost">
              <Link href="/orders">
                <ChevronLeftIcon />
                All orders
              </Link>
            </Button>
          </div>
        ) : (
          <div></div>
        )}

        <h1 className="text-sm uppercase font-mono px-2 bg-primary/10 rounded tracking-[0.07em]">
          <span className="">{`Order #${order.id}`}</span>
        </h1>
      </div>

      <div className="bg-card border rounded-lg px-6 py-4 flex flex-col gap-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:justify-between">
          <div className="">
            <p className="font-mono uppercase text-muted-foreground mb-1 text-sm">Order Date</p>
            <p className="text-lg">
              <time dateTime={order.createdAt}>
                {formatDateTime({ date: order.createdAt, format: 'MMMM dd, yyyy' })}
              </time>
            </p>
          </div>

          <div className="">
            <p className="font-mono uppercase text-muted-foreground mb-1 text-sm">Total</p>
            {order.amount && <Price className="text-lg" amount={order.amount} />}
          </div>

          {order.status && (
            <div className="grow max-w-1/3">
              <p className="font-mono uppercase text-muted-foreground mb-1 text-sm">Status</p>
              <OrderStatus className="text-sm" status={order.status} />
            </div>
          )}
        </div>

        {order.items && (
          <div>
            <h2 className="font-mono text-muted-foreground mb-4 uppercase text-sm">Items</h2>
            <ul className="flex flex-col gap-6">
              {order.items?.map((item, index) => {
                if (typeof item.product === 'string') {
                  return null
                }

                if (!item.product || typeof item.product !== 'object') {
                  return <div key={index}>This item is no longer available.</div>
                }

                const variant =
                  item.variant && typeof item.variant === 'object' ? item.variant : undefined

                return (
                  <li key={item.id}>
                    <ProductItem
                      product={item.product}
                      quantity={item.quantity}
                      variant={variant}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {order.shippingAddress && (
          <div>
            <h2 className="font-mono text-muted-foreground mb-4 uppercase text-sm">Shipping Address</h2>

            {/* @ts-expect-error - some kind of type hell */}
            <AddressItem address={order.shippingAddress} hideActions />
          </div>
        )}

        {/* Post-purchase recommendations — the industry-endorsed cross-sell
            slot: payment is already captured, so a suggestion here cannot
            cost the conversion. Curated accessories of the purchased items
            when they exist; automatic alternatives otherwise. */}
        {recommendations.items.length >= 3 && (
          <div className="border-t border-border pt-10">
            <h2 className="mb-6 text-2xl">
              {recommendations.curated ? 'Complete your setup' : 'You may also like'}
            </h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6">
              {recommendations.items.map((product) => (
                <li key={product.id}>
                  <ProductGridItem product={product} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params

  return {
    description: `Order details for order ${id}.`,
    openGraph: mergeOpenGraph({
      title: `Order ${id}`,
      url: `/orders/${id}`,
    }),
    // Private page — never in the index.
    robots: { index: false, follow: false },
    title: `Order ${id}`,
  }
}
