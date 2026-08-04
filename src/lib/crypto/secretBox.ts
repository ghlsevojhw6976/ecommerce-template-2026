import crypto from 'crypto'

/**
 * Authenticated encryption for credentials stored in the database.
 *
 * AES-256-GCM with a key derived from PAYLOAD_SECRET — the one secret this
 * app already refuses to run without, and the same one that protects every
 * admin session. A database dump alone therefore reveals nothing; an attacker
 * needs the deployment's environment as well, which is the boundary we are
 * actually defending (per-shop databases get dumped, copied and seeded far
 * more casually than env vars do).
 *
 * GCM rather than CBC because it authenticates: a tampered or truncated
 * ciphertext fails loudly at decrypt instead of yielding plausible garbage
 * that would then be sent to Stripe as a key.
 *
 * Format: `v1:<iv>:<authTag>:<ciphertext>` (base64url pieces). The version
 * prefix is there so a future algorithm change can coexist with old rows.
 */

const VERSION = 'v1'

const deriveKey = (): Buffer => {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) {
    // Payload itself will not boot without this, so in practice unreachable —
    // but never fall back to a hardcoded key.
    throw new Error('PAYLOAD_SECRET is required to encrypt stored credentials.')
  }
  // Static salt is fine here: PAYLOAD_SECRET is high-entropy machine material,
  // not a human password — scrypt is used as a KDF, not as a password hash.
  return crypto.scryptSync(secret, 'stripe-credential-box', 32)
}

export const seal = (plaintext: string): string => {
  const key = deriveKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

/** Returns null for anything that is not an intact box we sealed. */
export const open = (box: unknown): string | null => {
  if (typeof box !== 'string' || !box) return null

  const [version, ivPart, tagPart, dataPart] = box.split(':')
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) return null

  try {
    const key = deriveKey()
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ])
    return plaintext.toString('utf8')
  } catch {
    // Wrong PAYLOAD_SECRET, tampering, or truncation — all the same answer.
    return null
  }
}
