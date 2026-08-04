import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

export const testUser = {
  email: 'dev@payloadcms.com',
  password: 'test',
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  // Delete existing test user if any
  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })

  // Create fresh test user.
  //
  // The `admin` role is explicit rather than inherited. Users default to
  // `customer`, and `customer` is refused by the admin panel's access rule —
  // this user only ever got in when it happened to be the first row in the
  // database, where ensureFirstUserIsAdmin promotes it. Any run against a
  // database that already had a user failed with "this user does not have
  // access to the admin panel", which reads like a broken panel rather than a
  // broken fixture.
  await payload.create({
    collection: 'users',
    data: { ...testUser, roles: ['admin'] },
  })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })
}
