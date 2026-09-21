import { describe, expect, it } from 'vitest'
import { decodeUserId, frDateToIso } from './client'

const b64url = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url')
const fakeJwt = (payload: object): string => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`

describe('frDateToIso — les réponses Uncove sont clées en DD/MM/YYYY (jour Paris)', () => {
  it('convertit en ISO YYYY-MM-DD', () => {
    expect(frDateToIso('01/09/2026')).toBe('2026-09-01')
    expect(frDateToIso('31/12/2026')).toBe('2026-12-31')
  })
})

describe('decodeUserId — l’identité Uncove vit dans le payload du JWT', () => {
  it('extrait le champ id', () => {
    expect(decodeUserId(fakeJwt({ id: 'users/123', role: 'user', iat: 1 }))).toBe('users/123')
  })
  it('lève si le JWT est malformé', () => {
    expect(() => decodeUserId('pas-un-jwt')).toThrow()
  })
})
