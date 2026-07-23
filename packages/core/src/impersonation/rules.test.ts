import { describe, expect, it } from 'vitest'
import { isImpersonatable, signState, verifyState, isExpired } from './rules'
const SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx'
describe('isImpersonatable', () => {
  it('accepte les rôles opérationnels', () => {
    for (const r of ['manager','sous-manager','police','chatteur']) expect(isImpersonatable(r)).toBe(true)
  })
  it('refuse admin/superadmin/user/null (fail-closed)', () => {
    for (const r of ['admin','superadmin','user','',null,undefined]) expect(isImpersonatable(r as string)).toBe(false)
  })
})
describe('signState/verifyState', () => {
  it('round-trip', () => {
    const s = signState({ sid: 'abc', exp: 123 }, SECRET)
    expect(verifyState(s, SECRET)).toEqual({ sid: 'abc', exp: 123 })
  })
  it('rejette signature falsifiée', () => {
    const s = signState({ sid: 'abc', exp: 123 }, SECRET)
    expect(verifyState(s.slice(0, -2) + 'ff', SECRET)).toBeNull()
    expect(verifyState(s, SECRET + 'x')).toBeNull()
    expect(verifyState(undefined, SECRET)).toBeNull()
    expect(verifyState('garbage', SECRET)).toBeNull()
  })
})
describe('isExpired', () => {
  it('vrai après exp', () => { expect(isExpired(1000, 1001)).toBe(true); expect(isExpired(1000, 999)).toBe(false) })
})
