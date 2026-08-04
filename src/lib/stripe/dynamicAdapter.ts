import { stripeAdapter } from '@payloadcms/plugin-ecommerce/payments/stripe'

import { stripeWebhookHandlers } from '@/lib/stripe/webhookHandlers'
import {
  ensureStripeCredentialsLoaded,
  resolveStripePublishableKey,
  resolveStripeSecretKey,
  resolveStripeWebhookSecret,
} from '@/lib/stripe/keys'

/**
 * A Stripe adapter whose keys are read AT REQUEST TIME from the keystore
 * (admin-stored first, env fallback), so a key pasted in Settings → Stripe
 * works on the very next request — no restart, no redeploy.
 *
 * Why the indirection: the plugin's `stripeAdapter(props)` destructures the
 * keys ONCE, at the moment it is called, and Payload's config is built once
 * at boot. Passed directly, whatever the env contained at boot would be
 * frozen in forever and the admin fields would be decorative.
 *
 * Instead the factory is re-invoked inside each handler. It builds a small
 * object graph and touches no I/O, so per-request cost is negligible — and it
 * keeps us on the plugin's public export, not a deep import that breaks on
 * upgrade. The shape (name, label, collection group fields, endpoint paths)
 * is taken from one static call, because those are key-independent and the
 * plugin reads them at boot.
 */

type StripePaymentAdapter = ReturnType<typeof stripeAdapter>

const buildWithCurrentKeys = (): StripePaymentAdapter =>
  stripeAdapter({
    secretKey: resolveStripeSecretKey() ?? '',
    publishableKey: resolveStripePublishableKey() ?? '',
    webhookSecret: resolveStripeWebhookSecret() ?? '',
    // Events without an entry here are ACKed and discarded. The Stripe
    // settings page reads this same map, so the admin always reflects
    // what is genuinely handled.
    webhooks: stripeWebhookHandlers,
    // Checkout Sessions create the PaymentIntent lazily (at confirmation), so
    // a session-first transaction is keyed by the session id until the PI id
    // is stamped in at completion. This adds that key to the stripe group.
    groupOverrides: {
      fields: ({ defaultFields }) => [
        ...defaultFields,
        {
          name: 'checkoutSessionID',
          type: 'text',
          label: 'Stripe Checkout Session ID',
          index: true,
        },
      ],
    },
  })

export const dynamicStripeAdapter = (): StripePaymentAdapter => {
  const shape = buildWithCurrentKeys()

  return {
    ...shape,
    initiatePayment: async (args) => {
      await ensureStripeCredentialsLoaded(args.req.payload)
      return buildWithCurrentKeys().initiatePayment(args)
    },
    confirmOrder: async (args) => {
      await ensureStripeCredentialsLoaded(args.req.payload)
      return buildWithCurrentKeys().confirmOrder(args)
    },
    endpoints: (shape.endpoints ?? []).map((endpoint, index) => ({
      ...endpoint,
      handler: async (req) => {
        await ensureStripeCredentialsLoaded(req.payload)
        const live = buildWithCurrentKeys().endpoints?.[index]
        if (!live) {
          // Cannot happen unless the plugin changes its endpoint list between
          // two identical factory calls — fail closed if it somehow does.
          return Response.json({ message: 'Payment endpoint unavailable.' }, { status: 503 })
        }
        return live.handler(req)
      },
    })),
  }
}
