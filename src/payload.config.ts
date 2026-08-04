import { postgresAdapter } from '@payloadcms/db-postgres'

import {
  BoldFeature,
  EXPERIMENTAL_TableFeature,
  IndentFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  UnderlineFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'

import { loadStripeCredentials } from '@/lib/stripe/keys'
import { fileURLToPath } from 'url'

import { Categories } from '@/collections/Categories'
import { Media } from '@/collections/Media'
import { Pages } from '@/collections/Pages'
import { Reviews } from '@/collections/Reviews'
import { StripeEvents } from '@/collections/StripeEvents'
import { Suppliers } from '@/collections/Suppliers'
import { Users } from '@/collections/Users'
import { BrandSettings } from '@/globals/BrandSettings'
import { CompanySettings } from '@/globals/CompanySettings'
import { Footer } from '@/globals/Footer'
import { Homepage } from '@/globals/Homepage'
import { Header } from '@/globals/Header'
import { MerchantCenter } from '@/globals/MerchantCenter'
import { StripeSettings } from '@/globals/StripeSettings'
import { AnalyticsSettings } from '@/globals/AnalyticsSettings'
import { EmailSettings } from '@/globals/EmailSettings'
import { dynamicEmailAdapter } from '@/lib/email/adapter'
import { loadEmailCredentials } from '@/lib/email/keys'
import { loadMerchantCredentials } from '@/lib/merchant/keys'
import { plugins } from './plugins'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    components: {
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below and the import `BeforeLogin` statement on line 15.
      beforeLogin: ['@/components/BeforeLogin#BeforeLogin'],
      // Commerce dashboard: revenue, unfulfilled queue, latest orders —
      // replaces the stock template welcome block (whose seed button pointed
      // at the deleted demo-seed route).
      beforeDashboard: ['@/components/Dashboard/CommerceDashboard#CommerceDashboard'],
      // Pinned operator nav (Dashboard / Orders / Mail with badges).
      beforeNavLinks: ['@/components/AdminNav/OpsNav#OpsNav'],
      views: {
        mail: {
          Component: '@/components/Mail/View#MailView',
          path: '/mail',
        },
      },
    },
    user: Users.slug,
  },
  collections: [Users, Pages, Categories, Media, Suppliers, Reviews, StripeEvents],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
      // Static builds fan out to many worker processes, EACH with its own
      // pool — at the pg default of 10 per pool, a 16-core build machine
      // asks Postgres for ~150 connections and dies on 53300 (max is 100).
      // 5 per process is plenty at runtime too. Pairs with experimental.cpus
      // in next.config.ts.
      max: 5,
    },
  }),
  editor: lexicalEditor({
    features: () => {
      return [
        UnderlineFeature(),
        BoldFeature(),
        ItalicFeature(),
        OrderedListFeature(),
        UnorderedListFeature(),
        LinkFeature({
          enabledCollections: ['pages'],
          fields: ({ defaultFields }) => {
            const defaultFieldsWithoutUrl = defaultFields.filter((field) => {
              if ('name' in field && field.name === 'url') return false
              return true
            })

            return [
              ...defaultFieldsWithoutUrl,
              {
                name: 'url',
                type: 'text',
                admin: {
                  condition: ({ linkType }) => linkType !== 'internal',
                },
                label: ({ t }) => t('fields:enterURL'),
                required: true,
              },
            ]
          },
        }),
        IndentFeature(),
        EXPERIMENTAL_TableFeature(),
      ]
    },
  }),
  // Backed by the admin-managed mailbox (Settings → Email) — resolves SMTP
  // credentials per send, so auth emails ride the same transport as order
  // emails. See src/lib/email/adapter.ts.
  email: dynamicEmailAdapter,
  endpoints: [],
  // Decrypts admin-stored Stripe keys into the in-process keystore before the
  // first request, so payment code can read them synchronously.
  onInit: async (payload) => {
    await loadStripeCredentials(payload)
    await loadEmailCredentials(payload)
    await loadMerchantCredentials(payload)
  },
  globals: [Header, Footer, Homepage, CompanySettings, BrandSettings, MerchantCenter, StripeSettings, AnalyticsSettings, EmailSettings],
  plugins,
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // Sharp is now an optional dependency -
  // if you want to resize images, crop, set focal point, etc.
  // make sure to install it and pass it to the config.
  // sharp,
})
