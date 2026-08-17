import { describe, expect, it } from 'vitest'
import {
  canAccessNav,
  landingHref,
  pageChoicesFor,
  PAGE_SLUGS,
  slugFace,
  WORKSPACES,
  type NavAccess,
} from './workspaces'

const user = (pages: string[]): NavAccess => ({
  isAdmin: false,
  isSuperadmin: false,
  isManager: false,
  pages: new Set(pages),
})
const formation = WORKSPACES.find((w) => w.id === 'formation')!
const item = (href: string) => formation.nav.find((n) => n.href === href)!

describe('face Formation — droits', () => {
  it('expose les slugs frm-entrainement / frm-suivi (et plus frm-overview)', () => {
    expect(PAGE_SLUGS).toContain('frm-entrainement')
    expect(PAGE_SLUGS).toContain('frm-suivi')
    expect(PAGE_SLUGS).not.toContain('frm-overview')
    expect(slugFace('frm-entrainement')).toBe('formation')
    expect(slugFace('frm-suivi')).toBe('formation')
  })

  it('Modules est visible avec l’un OU l’autre des deux droits (anyOf)', () => {
    const modules = item('/formation/modules')
    expect(canAccessNav(modules, user(['frm-entrainement']))).toBe(true)
    expect(canAccessNav(modules, user(['frm-suivi']))).toBe(true)
    expect(canAccessNav(modules, user(['mkt-overview']))).toBe(false)
    expect(canAccessNav(modules, user([]))).toBe(false)
  })

  it('Overview = frm-suivi seul, Ma formation = frm-entrainement seul', () => {
    expect(canAccessNav(item('/formation/overview'), user(['frm-entrainement']))).toBe(false)
    expect(canAccessNav(item('/formation/overview'), user(['frm-suivi']))).toBe(true)
    expect(canAccessNav(item('/formation/ma-formation'), user(['frm-entrainement']))).toBe(true)
    expect(canAccessNav(item('/formation/ma-formation'), user(['frm-suivi']))).toBe(false)
  })

  it('Catalogue est adminOnly', () => {
    expect(canAccessNav(item('/formation/catalogue'), user(['frm-suivi', 'frm-entrainement']))).toBe(false)
    expect(canAccessNav(item('/formation/catalogue'), { ...user([]), isAdmin: true })).toBe(true)
  })

  it('les cases cochables de la face = 2 droits, libellés Suivi / Entraînement, sans doublon', () => {
    const choices = pageChoicesFor('formation')
    expect(choices.map((c) => c.slug)).toEqual(['frm-suivi', 'frm-entrainement'])
    expect(choices.map((c) => c.label)).toEqual(['Suivi', 'Entraînement'])
  })

  it('un chatter avec le seul droit Entraînement atterrit sur Ma formation', () => {
    expect(
      landingHref({ role: 'chatteur', superadmin: false, manager: false, pages: ['frm-entrainement', 'formation'] }),
    ).toBe('/formation/ma-formation')
  })
})
