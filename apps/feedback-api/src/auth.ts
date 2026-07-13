import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function credentialDigest(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export function createCredential(installationId: string) {
  const secret = randomBytes(32).toString('base64url')
  return { secret, token: `${installationId}.${secret}`, digest: credentialDigest(secret) }
}

export function bearerToken(request: Request): string | null {
  const value = request.headers.get('authorization')
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : null
}

export function parseInstallationToken(token: string | null): { id: string; secret: string } | null {
  if (!token) return null
  const separator = token.indexOf('.')
  if (separator < 1) return null
  const id = token.slice(0, separator)
  const secret = token.slice(separator + 1)
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[A-Za-z0-9_-]{40,64}$/.test(secret)) return null
  return { id, secret }
}

export function equalSecret(expectedDigest: string, secret: string): boolean {
  const actual = Buffer.from(credentialDigest(secret), 'hex')
  const expected = Buffer.from(expectedDigest, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function validAdminToken(token: string | null): boolean {
  const expectedValue = process.env.APEX_FEEDBACK_ADMIN_TOKEN
  if (!expectedValue || !token) return false
  const expected = Buffer.from(expectedValue)
  const actual = Buffer.from(token)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
