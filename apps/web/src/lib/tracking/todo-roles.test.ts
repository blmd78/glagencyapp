import { describe, expect, it } from 'vitest'
import { canOrganizeTodoOf, canWriteTodo } from './todo-roles'

const MANAGER = 'm0000000-0000-4000-8000-000000000001'
const AUTRE_MANAGER = 'm0000000-0000-4000-8000-000000000002'
const POLICE = 'p0000000-0000-4000-8000-000000000003'
const ADMIN = 'a0000000-0000-4000-8000-000000000004'

/** La cible par défaut : un sous-manager porteur du droit, rattaché à MANAGER. */
const sousManager = (managerIds: string[] = [MANAGER]) => ({
  role: 'sous-manager',
  pages: ['presence'],
  managerIds,
})

describe('canWriteTodo — qui a une to-do, et le droit d’y écrire', () => {
  it('l’encadrement porteur du droit « presence »', () => {
    expect(canWriteTodo('manager', ['presence'])).toBe(true)
    expect(canWriteTodo('sous-manager', ['presence'])).toBe(true)
  })

  it('le POLICIER porteur du droit — décision du 2026-09-08', () => {
    expect(canWriteTodo('police', ['presence'])).toBe(true)
  })

  it('l’admin et le superadmin sans porter le droit — ils ont tout', () => {
    expect(canWriteTodo('admin', [])).toBe(true)
    expect(canWriteTodo('superadmin', null)).toBe(true)
  })

  it('un encadrant SANS le droit : la case « Présence » n’est pas cochée, il n’a pas de to-do', () => {
    expect(canWriteTodo('manager', [])).toBe(false)
    expect(canWriteTodo('police', ['police'])).toBe(false)
  })

  it('un chatteur à qui on a coché « Présence » : il lit l’écran, il ne l’écrit pas', () => {
    expect(canWriteTodo('chatteur', ['presence'])).toBe(false)
  })
})

describe('canOrganizeTodoOf — qui peut ouvrir et garnir la semaine d’un autre', () => {
  it('l’admin : n’importe qui ayant une to-do, policier compris', () => {
    const p = { callerId: ADMIN, callerRole: 'admin' }
    expect(canOrganizeTodoOf({ ...p, target: sousManager([]) })).toBe(true)
    expect(canOrganizeTodoOf({ ...p, target: { role: 'police', pages: ['presence'], managerIds: null } })).toBe(true)
    expect(canOrganizeTodoOf({ ...p, target: { role: 'manager', pages: ['presence'], managerIds: null } })).toBe(true)
  })

  it('le manager : ses sous-managers RATTACHÉS, et eux seuls', () => {
    const p = { callerId: MANAGER, callerRole: 'manager' }
    expect(canOrganizeTodoOf({ ...p, target: sousManager([MANAGER]) })).toBe(true)
    expect(canOrganizeTodoOf({ ...p, target: sousManager([AUTRE_MANAGER]) })).toBe(false)
    expect(canOrganizeTodoOf({ ...p, target: sousManager([]) })).toBe(false)
  })

  // ————— Décision de Benoit, 2026-09-08 : « policier c’est comme manager, donc ils peuvent
  // faire pareil sur tous les sous-mana qu’il gère » — et un policier n’est rattaché à
  // personne (ATTACHABLE_ROLES.police est vide depuis 0095), d’où « tous ».
  it('le policier : TOUS les sous-managers, sans rattachement', () => {
    const p = { callerId: POLICE, callerRole: 'police' }
    expect(canOrganizeTodoOf({ ...p, target: sousManager([MANAGER]) })).toBe(true)
    expect(canOrganizeTodoOf({ ...p, target: sousManager([]) })).toBe(true)
  })

  it('le policier s’arrête au sous-manager : ni manager, ni admin, ni confrère policier', () => {
    const p = { callerId: POLICE, callerRole: 'police' }
    expect(canOrganizeTodoOf({ ...p, target: { role: 'manager', pages: ['presence'], managerIds: null } })).toBe(false)
    expect(canOrganizeTodoOf({ ...p, target: { role: 'police', pages: ['presence'], managerIds: null } })).toBe(false)
    expect(canOrganizeTodoOf({ ...p, target: { role: 'admin', pages: [], managerIds: null } })).toBe(false)
  })

  it('le manager ne touche pas à la semaine d’un policier — la dérogation ne joue que dans un sens', () => {
    expect(
      canOrganizeTodoOf({
        callerId: MANAGER,
        callerRole: 'manager',
        target: { role: 'police', pages: ['presence'], managerIds: null },
      }),
    ).toBe(false)
  })

  it('un sous-manager n’encadre personne', () => {
    expect(
      canOrganizeTodoOf({ callerId: 'x', callerRole: 'sous-manager', target: sousManager([]) }),
    ).toBe(false)
  })

  it('personne ne dépose chez quelqu’un qui ne peut pas ouvrir sa to-do — admin compris', () => {
    const cible = { role: 'sous-manager', pages: [], managerIds: [MANAGER] }
    expect(canOrganizeTodoOf({ callerId: ADMIN, callerRole: 'admin', target: cible })).toBe(false)
    expect(canOrganizeTodoOf({ callerId: MANAGER, callerRole: 'manager', target: cible })).toBe(false)
    expect(canOrganizeTodoOf({ callerId: POLICE, callerRole: 'police', target: cible })).toBe(false)
    expect(
      canOrganizeTodoOf({
        callerId: ADMIN,
        callerRole: 'admin',
        target: { role: 'chatteur', pages: ['presence'], managerIds: null },
      }),
    ).toBe(false)
  })
})
