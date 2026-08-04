/**
 * Shared test environment: which database the tests talk to, and which server.
 *
 * Both matter for the same reason. The suites create real users, products,
 * variants, transactions and orders. Pointed at the development database they
 * do not just risk leaving debris behind — they write into the live catalogue,
 * and anything a failing test skips cleaning up becomes a permanent fixture of
 * the shop. That has already happened once here: a test user was left in the
 * production users table by an aborted run.
 *
 * So the tests get their own database and their own server, and the server is
 * never reused. `reuseExistingServer` was the sharp edge: with a dev server
 * already running on the default port, Playwright would silently attach to it
 * and drive the live database no matter what DATABASE_URL the test process
 * had set for itself.
 */

/**
 * Development database URL → test database URL.
 *
 * Appends `_test` to the database name, leaving any query string in place.
 * Already-suffixed names pass through unchanged so this is safe to apply twice.
 * TEST_DATABASE_URL overrides the derivation entirely.
 */
export const testDatabaseUrl = (devUrl = process.env.DATABASE_URL ?? ''): string => {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL

  return devUrl.replace(/([^/?]+)(\?.*)?$/, (_match, dbName: string, query = '') =>
    dbName.endsWith('_test') ? `${dbName}${query}` : `${dbName}_test${query}`,
  )
}

/**
 * Port for the e2e server — deliberately NOT 3000, so a dev server running in
 * another terminal is never mistaken for the test server.
 */
export const E2E_PORT = process.env.E2E_PORT ?? '3001'

/** Origin the e2e suite drives. Set by playwright.config.ts for its workers. */
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`
