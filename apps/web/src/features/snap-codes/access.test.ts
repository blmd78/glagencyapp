import { describe, expect, it } from 'vitest'
import { canWriteSnapCode, writableCreatorIds } from './access'

const admin = { role: 'admin' as const, manager: false, pages: [] as string[] }
const manager = { role: 'chatteur' as const, manager: true, pages: ['codes-snap'] }
const managerSansPage = { role: 'chatteur' as const, manager: true, pages: ['presence'] }
const chatteur = { role: 'chatteur' as const, manager: false, pages: ['codes-snap'] }

const ALL = ['lena', 'julie', 'sara', 'mia']
const MINE = new Set(['lena', 'julie', 'sara'])

describe('writableCreatorIds — qui peut modifier quels codes Snap', () => {
  it('admin : tous les modèles', () => {
    expect(writableCreatorIds(admin, null, ALL)).toEqual(ALL)
  })
  it('manager porteur de la page : ses modèles assignés seulement, dans l’ordre de la liste', () => {
    expect(writableCreatorIds(manager, MINE, ALL)).toEqual(['lena', 'julie', 'sara'])
  })
  it('manager SANS modèle assigné : aucun (les identifiants ne s’ouvrent pas par défaut)', () => {
    expect(writableCreatorIds(manager, null, ALL)).toEqual([])
  })
  it('manager sans la page : aucun', () => {
    expect(writableCreatorIds(managerSansPage, MINE, ALL)).toEqual([])
  })
  it('chatteur avec la page : aucun (lecture seule)', () => {
    expect(writableCreatorIds(chatteur, MINE, ALL)).toEqual([])
  })
})

describe('canWriteSnapCode — garde d’une écriture', () => {
  it('manager : vrai sur un modèle assigné, faux sur un autre', () => {
    expect(canWriteSnapCode(manager, MINE, 'lena')).toBe(true)
    expect(canWriteSnapCode(manager, MINE, 'mia')).toBe(false)
  })
  it('manager sans assignation : faux', () => {
    expect(canWriteSnapCode(manager, null, 'lena')).toBe(false)
  })
  it('admin : vrai partout', () => {
    expect(canWriteSnapCode(admin, null, 'mia')).toBe(true)
  })
})
