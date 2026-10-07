import { describe, expect, it } from 'vitest'
import { isAdminOrManager } from './roles'

describe('isAdminOrManager', () => {
  it('admin (superadmin compris) ou encadrant ; jamais un chatteur', () => {
    expect(isAdminOrManager({ role: 'admin', manager: false })).toBe(true)
    expect(isAdminOrManager({ role: 'chatteur', manager: true })).toBe(true)
    expect(isAdminOrManager({ role: 'chatteur', manager: false })).toBe(false)
  })
})
