import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

import { StatusPill } from '@/components/Orders/StatusPill'
import {
  DismissibleWarnings,
  type AdvisoryWarning,
} from '@/components/Dashboard/DismissibleWarnings'
import {
  ensureEmailCredentialsLoaded,
  resolveImapConfig,
  resolveSmtpConfig,
} from '@/lib/email/keys'
import {
  ensureStripeCredentialsLoaded,
  resolveStripeSecretKey,
} from '@/lib/stripe/keys'

/**
 * The admin homepage: what happened, what's owed to customers, what it's
 * worth — before the generic collection cards.
 *
 * Server component on the admin route (always dynamic), so every load reads
 * live Postgres through the local API + one raw aggregate query for the
 * daily buckets. No chart library: the revenue chart is a hand-drawn SVG —
 * a dependency-free bar chart is entirely sufficient for 30 data points,
 * and this template treats dependencies as liabilities.
 *
 * Money rule: `amount` is integer cents; Postgres returns numeric as
 * STRINGS through pg — every aggregate is coerced with Number() (the
 * documented typeof-never-fires trap).
 *
 * Visitors deliberately absent: that data lives in GA4 and needs the
 * Analytics Data API + service account — an env-only credential, per the
 * Google-keys rule. Wire it later; never fake it with a counter.
 */

const money = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const PAID_STATUSES = ['processing', 'completed'] as const

type DayBucket = { day: string; cents: number; orders: number }

const fetchDashboardData = async () => {
  const payload = await getPayload({ config: configPromise })

  const [latest, unfulfilled, paid30] = await Promise.all([
    payload.find({
      collection: 'orders',
      depth: 0,
      limit: 8,
      sort: '-createdAt',
      overrideAccess: true,
    }),
    payload.count({
      collection: 'orders',
      where: { fulfilmentStatus: { equals: 'needs_shipment' } },
      overrideAccess: true,
    }),
    payload.find({
      collection: 'orders',
      depth: 0,
      limit: 0,
      pagination: false,
      select: { amount: true },
      where: {
        and: [
          { status: { in: PAID_STATUSES as unknown as string[] } },
          {
            createdAt: {
              greater_than: new Date(Date.now() - 30 * 86_400_000).toISOString(),
            },
          },
        ],
      },
      overrideAccess: true,
    }),
  ])

  // Daily buckets for the chart — one aggregate in SQL rather than 30 finds.
  const pool = (payload.db as unknown as { pool?: { query: Function } }).pool
  let days: DayBucket[] = []
  if (pool?.query) {
    const { rows } = await pool.query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
              COALESCE(SUM(amount), 0) AS cents,
              COUNT(*) AS orders
       FROM orders
       WHERE status = ANY($1) AND created_at > now() - interval '30 days'
       GROUP BY 1 ORDER BY 1`,
      [PAID_STATUSES],
    )
    days = rows.map((row: Record<string, unknown>) => ({
      day: String(row.day),
      cents: Number(row.cents) || 0,
      orders: Number(row.orders) || 0,
    }))
  }

  const revenue30 = paid30.docs.reduce(
    (sum, order) => sum + (typeof order.amount === 'number' ? order.amount : 0),
    0,
  )
  const orders30 = paid30.docs.length

  // Setup state — read from the LIVE keystores (admin > env resolution),
  // not raw DB rows, so the warnings agree with what the shop actually
  // resolves at runtime.
  await Promise.all([
    ensureStripeCredentialsLoaded(payload),
    ensureEmailCredentialsLoaded(payload),
  ])
  const [analytics, merchant, company] = await Promise.all([
    payload.findGlobal({ slug: 'analytics', depth: 0, overrideAccess: true }).catch(() => null),
    payload
      .findGlobal({ slug: 'merchant-center', depth: 0, overrideAccess: true })
      .catch(() => null),
    payload.findGlobal({ slug: 'company', depth: 0, overrideAccess: true }).catch(() => null),
  ])

  const setup = {
    stripe: Boolean(resolveStripeSecretKey()),
    smtp: Boolean(resolveSmtpConfig()),
    imap: Boolean(resolveImapConfig()),
    analytics: Boolean(analytics?.gaMeasurementId?.trim()),
    // Advisory (dismissible) conditions — completion is partly external, so
    // these auto-hide when detectable and are dismissible either way.
    merchantConfigured: Boolean(
      (merchant as { merchantAccountId?: string | null } | null)?.merchantAccountId?.trim(),
    ),
    // The seeded FICTIONAL registration number — while it survives, the
    // legally-required identity block is demo data, which matters.
    companyPlaceholder:
      (company as { companyNumber?: string | null } | null)?.companyNumber === 'IL-8842119',
  }

  return {
    latest: latest.docs,
    unfulfilled: unfulfilled.totalDocs,
    revenue30,
    orders30,
    aov: orders30 ? Math.round(revenue30 / orders30) : 0,
    days,
    setup,
  }
}

const SetupWarning: React.FC<{ title: string; why: string; href: string; cta: string }> = ({
  title,
  why,
  href,
  cta,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      border: '1px solid #f0d9a8',
      background: '#fef7e6',
      padding: '12px 16px',
    }}
  >
    <div>
      <div style={{ fontWeight: 600, fontSize: '14px', color: '#78350f' }}>{title}</div>
      <div style={{ fontSize: '13px', color: '#92600f', marginTop: '2px' }}>{why}</div>
    </div>
    <a
      href={href}
      style={{
        flexShrink: 0,
        fontSize: '13px',
        fontWeight: 600,
        color: '#78350f',
        textDecoration: 'underline',
      }}
    >
      {cta}
    </a>
  </div>
)

const StatCard: React.FC<{ label: string; value: string; href?: string; accent?: boolean }> = ({
  label,
  value,
  href,
  accent,
}) => {
  const card = (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        background: accent ? 'var(--theme-elevation-50)' : 'transparent',
        padding: '16px 20px',
        minWidth: '160px',
        flex: '1 1 160px',
      }}
    >
      <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 }}>
        {label}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 600, marginTop: '6px' }}>{value}</div>
    </div>
  )
  return href ? (
    <a href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'contents' }}>
      {card}
    </a>
  ) : (
    card
  )
}

const RevenueChart: React.FC<{ days: DayBucket[] }> = ({ days }) => {
  if (days.length === 0) {
    return <p style={{ opacity: 0.6, fontSize: '14px' }}>No paid orders in the last 30 days yet.</p>
  }

  // Fill missing days so gaps read as zero, not as compressed time.
  const byDay = new Map(days.map((bucket) => [bucket.day, bucket]))
  const series: DayBucket[] = []
  for (let i = 29; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000)
    const key = date.toISOString().slice(0, 10)
    series.push(byDay.get(key) ?? { day: key, cents: 0, orders: 0 })
  }

  const max = Math.max(...series.map((bucket) => bucket.cents), 1)
  const width = 900
  const height = 160
  const barGap = 4
  const barWidth = (width - barGap * (series.length - 1)) / series.length

  return (
    <svg
      preserveAspectRatio="none"
      role="img"
      aria-label="Daily revenue, last 30 days"
      style={{ width: '100%', height: '160px', display: 'block' }}
      viewBox={`0 0 ${width} ${height}`}
    >
      {series.map((bucket, index) => {
        const barHeight = Math.max(bucket.cents > 0 ? 3 : 0, (bucket.cents / max) * (height - 20))
        return (
          <g key={bucket.day}>
            <title>{`${bucket.day}: ${money(bucket.cents)} (${bucket.orders} order${bucket.orders === 1 ? '' : 's'})`}</title>
            <rect
              fill="var(--theme-success-500, #2e7d5b)"
              height={barHeight}
              rx={2}
              width={barWidth}
              x={index * (barWidth + barGap)}
              y={height - barHeight}
            />
          </g>
        )
      })}
    </svg>
  )
}

export const CommerceDashboard: React.FC = async () => {
  const data = await fetchDashboardData()
  const first = data.days[0]?.day
  const last = data.days[data.days.length - 1]?.day

  const warnings = [
    !data.setup.stripe && (
      <SetupWarning
        cta="Connect Stripe"
        href="/admin/globals/stripe-settings"
        key="stripe"
        title="Checkout is disabled — no Stripe keys"
        why="Customers cannot pay until API keys are added. Paste them in Settings → Stripe; they take effect without a restart."
      />
    ),
    !data.setup.smtp && (
      <SetupWarning
        cta="Connect mailbox"
        href="/admin/globals/email-settings"
        key="smtp"
        title="Email is not configured"
        why="Order confirmations, tracking emails and password resets are not being sent."
      />
    ),
    data.setup.smtp && !data.setup.imap && (
      <SetupWarning
        cta="Add IMAP"
        href="/admin/globals/email-settings"
        key="imap"
        title="Inbox (IMAP) is not connected"
        why="Sending works, but the Mail view cannot read the mailbox or file sent copies."
      />
    ),
    !data.setup.analytics && (
      <SetupWarning
        cta="Add GA4 ID"
        href="/admin/globals/analytics"
        key="analytics"
        title="Google Analytics is off"
        why="No visitor or e-commerce funnel data is being collected. Paste a G-XXXX measurement ID."
      />
    ),
  ].filter(Boolean)

  const advisories: AdvisoryWarning[] = [
    ...(!data.setup.merchantConfigured
      ? [
          {
            key: 'merchant-feed',
            title: 'Google Merchant Center is not connected',
            why: 'Your products are not on Google Shopping. Add the feed URL from the Export tab as a scheduled fetch, and enter your merchant account ID.',
            href: '/admin/globals/merchant-center',
            cta: 'Set up feed',
          },
        ]
      : []),
    ...(data.setup.companyPlaceholder
      ? [
          {
            key: 'company-details',
            title: 'Company details are still the demo placeholders',
            why: 'The registration number, tax ID and address shown in your footer and legal pages are fictional seed data — consumer law requires the real ones before launch.',
            href: '/admin/globals/company',
            cta: 'Update company',
          },
        ]
      : []),
  ]

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <DismissibleWarnings warnings={advisories} />
      {warnings.length > 0 && (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.5rem' }}
        >
          {warnings}
        </div>
      )}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <StatCard label="Revenue · 30 days" value={money(data.revenue30)} />
        <StatCard label="Paid orders · 30 days" value={String(data.orders30)} />
        <StatCard label="Avg order value" value={money(data.aov)} />
        <StatCard
          accent
          href="/admin/collections/orders?where%5Bor%5D%5B0%5D%5Band%5D%5B0%5D%5BfulfilmentStatus%5D%5Bequals%5D=needs_shipment"
          label="Needs shipment"
          value={String(data.unfulfilled)}
        />
      </div>

      <div
        style={{
          border: '1px solid var(--theme-elevation-150)',
          padding: '16px 20px',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '12px',
            opacity: 0.7,
            marginBottom: '10px',
          }}
        >
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Daily revenue — last 30 days
          </span>
          <span>
            {first} → {last}
          </span>
        </div>
        <RevenueChart days={data.days} />
      </div>

      <div style={{ border: '1px solid var(--theme-elevation-150)', padding: '16px 20px' }}>
        <div
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            opacity: 0.7,
            marginBottom: '10px',
          }}
        >
          Latest orders
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <tbody>
            {data.latest.map((order) => (
              <tr key={order.id} style={{ borderTop: '1px solid var(--theme-elevation-100)' }}>
                <td style={{ padding: '8px 8px 8px 0' }}>
                  <a href={`/admin/collections/orders/${order.id}`}>#{order.id}</a>
                </td>
                <td style={{ padding: '8px' }}>
                  {order.createdAt
                    ? new Date(order.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : ''}
                </td>
                <td style={{ padding: '8px', opacity: 0.8 }}>{order.customerEmail || '—'}</td>
                <td style={{ padding: '8px' }}>
                  <StatusPill
                    cellData={(order as { fulfilmentStatus?: string }).fulfilmentStatus ?? ''}
                    collectionSlug="orders"
                    field={{} as never}
                    rowData={{}}
                  />
                </td>
                <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {typeof order.amount === 'number' ? money(order.amount) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
