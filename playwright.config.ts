import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

import { BASE_URL, E2E_PORT, testDatabaseUrl } from './tests/helpers/testEnv'

/**
 * The e2e suite gets its own database and its own server.
 *
 * This file is loaded by the runner AND by every worker process, so assigning
 * DATABASE_URL here is what makes the Payload instances the specs import talk
 * to the test database rather than the development one. See tests/helpers/testEnv.ts
 * for why that matters.
 */
const DATABASE_URL = testDatabaseUrl()

if (!DATABASE_URL) {
  throw new Error(
    'e2e tests need a database. Set DATABASE_URL (a _test suffix is added automatically) or TEST_DATABASE_URL.',
  )
}

process.env.DATABASE_URL = DATABASE_URL
process.env.E2E_BASE_URL = BASE_URL

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 3 : 1,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: BASE_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${E2E_PORT}`,
    // Never attach to a server someone else started: it would be pointed at the
    // development database, which is precisely what this setup exists to avoid.
    reuseExistingServer: false,
    url: BASE_URL,
    // A cold Next dev start plus Payload's schema push on a fresh test database
    // comfortably exceeds the 60s default.
    timeout: 180_000,
    env: {
      DATABASE_URL,
      // Its own build directory, so Next's one-dev-server-per-project-dir lock
      // does not make the suite unrunnable while a dev server is open.
      NEXT_DIST_DIR: '.next-e2e',
      // The storefront's auth calls are absolute, built from this variable. Left
      // at its .env value it points at port 3000 — so the pages under test would
      // authenticate and register against whatever server is running there,
      // which is the development one on the live database. Every credential in
      // this suite then fails against a database that never saw its fixtures.
      NEXT_PUBLIC_SERVER_URL: BASE_URL,
    },
  },
})
