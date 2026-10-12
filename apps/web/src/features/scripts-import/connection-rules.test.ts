import { describe, expect, it } from 'vitest'
import { canDisconnect, canSeeConnection } from './connection-rules'

const admin = { id: 'a1', role: 'admin' }
const manager = { id: 'm1', role: 'chatteur' }
const other = { id: 'm2', role: 'chatteur' }

describe('canSeeConnection', () => {
  it('un espace partagé (connecté par un admin) : toute l’équipe le voit', () => {
    for (const v of [admin, manager, other]) expect(canSeeConnection({ shared: true, connectedById: 'a1' }, v)).toBe(true)
  })
  it('un espace privé : seulement la personne qui l’a connecté — ni un autre manager, ni un admin', () => {
    const row = { shared: false, connectedById: 'm1' }
    expect(canSeeConnection(row, manager)).toBe(true)
    expect(canSeeConnection(row, other)).toBe(false)
    expect(canSeeConnection(row, admin)).toBe(false)
  })
  it('« en tant que » : la session est celle du manager, mais son Notion perso reste caché ; le partagé reste visible', () => {
    const asManager = { ...manager, impersonating: true }
    expect(canSeeConnection({ shared: false, connectedById: 'm1' }, asManager)).toBe(false)
    expect(canSeeConnection({ shared: true, connectedById: 'a1' }, asManager)).toBe(true)
  })
  it('un espace privé dont l’auteur a quitté l’agence (connected_by vide) : personne', () => {
    expect(canSeeConnection({ shared: false, connectedById: null }, manager)).toBe(false)
  })
})

describe('canDisconnect', () => {
  it('le sien ; un admin, n’importe lequel ; jamais celui d’un autre manager', () => {
    expect(canDisconnect({ connectedById: 'm1' }, manager)).toBe(true)
    expect(canDisconnect({ connectedById: 'm1' }, other)).toBe(false)
    expect(canDisconnect({ connectedById: 'm1' }, admin)).toBe(true)
    expect(canDisconnect({ connectedById: null }, manager)).toBe(false)
  })
})
