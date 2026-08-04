// Load .env files
import 'dotenv/config'

import { testDatabaseUrl } from './tests/helpers/testEnv'

/**
 * Point integration tests at a SEPARATE database.
 *
 * The integration tests create real products, transactions and reviews. Run
 * against the development database, anything a test fails to clean up becomes a
 * permanent fixture of the shop — test products were appearing in the storefront
 * grid and on the homepage, which is exactly the sort of thing that eventually
 * reaches production.
 *
 * Payload pushes schema on init in dev, so the test database needs no migration
 * step — it is created empty and built on first run.
 *
 * Override with TEST_DATABASE_URL if the derived name is not what you want.
 */
process.env.DATABASE_URL = testDatabaseUrl()

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Tests need a database. Set DATABASE_URL (a _test suffix is added automatically) or TEST_DATABASE_URL.',
  )
}
