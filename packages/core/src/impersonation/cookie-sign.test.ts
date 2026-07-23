import { describe, expect, it } from 'vitest'
import { signState, verifyState } from './cookie-sign'
const SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx'
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
