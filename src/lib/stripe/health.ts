import { getStripe, getStripeMode, maskKey } from './client'
import {
  resolveStripeSecretKey,
  resolveStripeWebhookSecret,
  stripeKeySource,
  type StripeKeySource,
} from './keys'
import {
  handledWebhookEvents,
  RECOMMENDED_WEBHOOK_EVENTS,
  STRIPE_WEBHOOK_PATH,
} from './webhookHandlers'

/**
 * Connection and webhook diagnostics.
 *
 * The failure this exists to catch: a webhook silently stops being delivered
 * (revoked endpoint, rotated signing secret, a deploy that changed the URL) and
 * orders quietly stop being marked paid. Nothing errors — money arrives at
 * Stripe and the shop just looks idle. Surfacing "last event received" makes
 * that visible in seconds instead of days.
 */

export type StripeHealth = {
  connected: boolean
  mode: 'live' | 'test' | 'unset'
  keyMasked: string
  /** Where each credential is coming from: admin settings, env, or nowhere. */
  keySource: StripeKeySource
  publishableKeySource: StripeKeySource
  webhookSecretSource: StripeKeySource
  accountId?: string
  accountName?: string
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  webhookSecretConfigured: boolean
  webhookEndpoints: {
    id: string
    url: string
    status: string
    enabledEvents: number
  }[]
  lastEventAt?: string
  lastEventType?: string
  /** Events Stripe is still trying to deliver — a sustained non-zero is a red flag. */
  pendingWebhookEvents: number
  error?: string

  // --- Webhook setup guidance -------------------------------------------
  /** Absolute URL to paste into the Stripe dashboard. */
  webhookUrl: string
  /** True when the URL is not reachable from the internet, so Stripe cannot call it. */
  webhookUrlIsLocal: boolean
  /** Event types this codebase actually handles (from the handler map). */
  handledEvents: string[]
  recommendedEvents: { event: string; why: string; critical: boolean }[]
  /** Recommended events with no handler registered — configuring them alone does nothing. */
  unhandledCriticalEvents: string[]
  /** Whether an endpoint matching our URL already exists in this Stripe account. */
  matchingEndpointFound: boolean
}

export const getStripeHealth = async (): Promise<StripeHealth> => {
  const mode = getStripeMode()
  // Mask the key that is actually IN USE (admin-stored beats env — keys.ts),
  // and note its source, so a stale env var can never silently shadow what
  // the admin page displays. Placeholder prefixes count as absent throughout.
  const keyMasked = maskKey(resolveStripeSecretKey())
  const webhookSecretConfigured = Boolean(resolveStripeWebhookSecret())
  const stripe = getStripe()

  const serverUrl = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  )
  const webhookUrl = `${serverUrl}${STRIPE_WEBHOOK_PATH}`
  const webhookUrlIsLocal = /localhost|127\.0\.0\.1|\.local(:|$)/i.test(serverUrl)

  const unhandledCriticalEvents = RECOMMENDED_WEBHOOK_EVENTS.filter(
    (e) => e.critical && !handledWebhookEvents.includes(e.event),
  ).map((e) => e.event)

  const base: StripeHealth = {
    connected: false,
    mode,
    keyMasked,
    keySource: stripeKeySource('secretKey'),
    publishableKeySource: stripeKeySource('publishableKey'),
    webhookSecretSource: stripeKeySource('webhookSecret'),
    webhookSecretConfigured,
    webhookEndpoints: [],
    pendingWebhookEvents: 0,
    webhookUrl,
    webhookUrlIsLocal,
    handledEvents: handledWebhookEvents,
    recommendedEvents: RECOMMENDED_WEBHOOK_EVENTS,
    unhandledCriticalEvents,
    matchingEndpointFound: false,
  }

  if (!stripe) {
    return {
      ...base,
      error:
        'No Stripe secret key is configured. Paste one under API keys above, or set STRIPE_SECRET_KEY in the environment.',
    }
  }

  try {
    const account = await stripe.accounts.retrieve()

    // Independent calls; one failing should not blank the whole panel.
    const [endpoints, events] = await Promise.all([
      stripe.webhookEndpoints.list({ limit: 10 }).catch(() => null),
      stripe.events.list({ limit: 10 }).catch(() => null),
    ])

    const latest = events?.data?.[0]

    return {
      ...base,
      connected: true,
      accountId: account.id,
      accountName: account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? undefined,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      webhookEndpoints:
        endpoints?.data?.map((e) => ({
          id: e.id,
          url: e.url,
          status: e.status,
          enabledEvents: e.enabled_events?.length ?? 0,
        })) ?? [],
      lastEventAt: latest ? new Date(latest.created * 1000).toISOString() : undefined,
      lastEventType: latest?.type,
      pendingWebhookEvents:
        events?.data?.reduce((sum, e) => sum + (e.pending_webhooks ?? 0), 0) ?? 0,
      matchingEndpointFound: Boolean(
        endpoints?.data?.some((e) => e.url.replace(/\/$/, '') === webhookUrl),
      ),
    }
  } catch (error) {
    return {
      ...base,
      error:
        error instanceof Error
          ? error.message
          : 'Could not reach Stripe with the configured key.',
    }
  }
}
