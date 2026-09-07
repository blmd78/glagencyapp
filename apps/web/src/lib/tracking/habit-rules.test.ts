import { describe, expect, it } from 'vitest'
import { canEditHabit } from './habit-rules'

const BENOIT = 'b0000000-0000-4000-8000-000000000001'
const MANAGER = 'm0000000-0000-4000-8000-000000000002'
const SOUS_MANAGER = 's0000000-0000-4000-8000-000000000003'

/** Le titulaire de la semaine, toujours le même dans ces cas : le sous-manager. */
const chez = (createdBy: string | null) => ({ ownerId: SOUS_MANAGER, createdBy })

describe('canEditHabit — qui peut renommer, mettre en pause ou supprimer une habitude', () => {
  it('le titulaire : ses propres habitudes (created_by null)', () => {
    expect(canEditHabit({ callerId: SOUS_MANAGER, callerRole: 'sous-manager', ...chez(null) })).toBe(true)
  })

  it('le titulaire : PAS celle qu’on lui a déposée — c’est tout le sens de la feature', () => {
    expect(canEditHabit({ callerId: SOUS_MANAGER, callerRole: 'sous-manager', ...chez(MANAGER) })).toBe(false)
  })

  it('le déposant : ce qu’il a posé', () => {
    expect(canEditHabit({ callerId: MANAGER, callerRole: 'manager', ...chez(MANAGER) })).toBe(true)
  })

  it('un manager SANS dérogation sur cette semaine : rien, même sur l’habitude d’un confrère', () => {
    expect(canEditHabit({ callerId: MANAGER, callerRole: 'manager', ...chez(null) })).toBe(false)
    expect(canEditHabit({ callerId: MANAGER, callerRole: 'manager', ...chez('autre-manager') })).toBe(false)
  })

  // ————— Décision de Benoit, 2026-09-07 : « les managers ont tous les droits sur leurs
  // sous-managers, ils peuvent gérer leur emploi du temps comme ils veulent ».
  it('le manager DU titulaire : l’habitude que le sous-manager s’est donnée lui-même', () => {
    expect(
      canEditHabit({ callerId: MANAGER, callerRole: 'manager', ...chez(null), canOrganize: true }),
    ).toBe(true)
  })

  it('le manager DU titulaire : même celle déposée par quelqu’un d’autre', () => {
    expect(
      canEditHabit({ callerId: MANAGER, callerRole: 'manager', ...chez('autre-manager'), canOrganize: true }),
    ).toBe(true)
  })

  it('le titulaire reste verrouillé sur ce qu’on lui dépose — `canOrganize` est faux chez soi', () => {
    // L'invariant que les deux appelants garantissent (`callerId !== ownerId`) : sans lui, un
    // sous-manager qui encadre à son tour rouvrirait la porte sur SES propres habitudes déposées.
    expect(
      canEditHabit({ callerId: SOUS_MANAGER, callerRole: 'sous-manager', ...chez(MANAGER), canOrganize: false }),
    ).toBe(false)
  })

  it('admin : partout, quel que soit le déposant (dérogation « corriger une erreur »)', () => {
    expect(canEditHabit({ callerId: BENOIT, callerRole: 'admin', ...chez(null) })).toBe(true)
    expect(canEditHabit({ callerId: BENOIT, callerRole: 'admin', ...chez(MANAGER) })).toBe(true)
  })

  it('superadmin : reconnu sous sa forme `baseRole` comme sous sa forme `role`', () => {
    expect(canEditHabit({ callerId: BENOIT, callerRole: 'superadmin', ...chez(MANAGER) })).toBe(true)
  })

  it('un chatteur porteur du droit ne devient pas propriétaire d’une habitude déposée', () => {
    expect(canEditHabit({ callerId: SOUS_MANAGER, callerRole: 'chatteur', ...chez(BENOIT) })).toBe(false)
  })
})
