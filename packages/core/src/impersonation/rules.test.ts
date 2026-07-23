import { describe, expect, it } from 'vitest'
import { isImpersonatable } from './rules'
describe('isImpersonatable', () => {
  it('accepte les rôles opérationnels', () => {
    for (const r of ['manager','sous-manager','police','chatteur']) expect(isImpersonatable(r)).toBe(true)
  })
  it('refuse admin/superadmin/user/null (fail-closed)', () => {
    for (const r of ['admin','superadmin','user','',null,undefined]) expect(isImpersonatable(r as string)).toBe(false)
  })
})
