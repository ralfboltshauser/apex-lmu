import { describe, expect, it } from 'vitest'
import { createCredential, equalSecret, parseInstallationToken } from './auth'

describe('feedback credentials', () => {
  it('round-trips a generated installation credential without storing its secret', () => {
    const id = crypto.randomUUID()
    const credential = createCredential(id)
    const parsed = parseInstallationToken(credential.token)
    expect(parsed?.id).toBe(id)
    expect(equalSecret(credential.digest, parsed!.secret)).toBe(true)
    expect(equalSecret(credential.digest, `${parsed!.secret}x`)).toBe(false)
  })

  it('rejects malformed tokens', () => {
    expect(parseInstallationToken('invalid')).toBeNull()
  })
})
