import { describe, expect, it } from 'vitest'
import {
  canAccessNav,
  landingHref,
  pageChoicesFor,
  PAGE_SLUGS,
  slugFace,
  WORKSPACES,
  workspaceHome,
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

  // « Modules » n'est PLUS un item de nav (2026-08-25) : on navigue depuis « Ma formation », dont
  // le panneau « Tes modules » liste tout le catalogue. Les PAGES, elles, restent servies — ce test
  // garde l'absence de l'item, pour qu'une réintroduction accidentelle se voie.
  it('Modules n’a plus d’item de nav', () => {
    expect(WORKSPACES.find((w) => w.id === 'formation')?.nav.some((n) => n.href === '/formation/modules')).toBe(false)
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

  // Le recrutement précède la formation dans le parcours réel : l'encadrant qui suit la promo voit
  // arriver les dossiers et intègre les gens (0135). Les gestes SENSIBLES restent admin, mais ils
  // sont gardés côté Server Action — pas par la nav.
  it('Recrutement suit le droit Suivi, PAS Entraînement', () => {
    expect(canAccessNav(item('/formation/recrutement'), user(['frm-suivi']))).toBe(true)
    expect(canAccessNav(item('/formation/recrutement'), user(['frm-entrainement']))).toBe(false)
    expect(canAccessNav(item('/formation/recrutement'), { ...user([]), isAdmin: true })).toBe(true)
  })

  it('Config du test reste adminOnly', () => {
    expect(canAccessNav(item('/formation/recrutement/config'), user(['frm-suivi', 'frm-entrainement']))).toBe(false)
    expect(canAccessNav(item('/formation/recrutement/config'), { ...user([]), isAdmin: true })).toBe(true)
  })

  it('ni l’un ni l’autre n’ajoute une case à cocher dans Membres', () => {
    for (const href of ['/formation/recrutement', '/formation/recrutement/config']) {
      expect(item(href).slug).toBeUndefined()
    }
    expect(pageChoicesFor('formation').map((c) => c.slug)).toEqual(['frm-suivi', 'frm-entrainement'])
  })

  // Le sous-onglet est rendu dans le CORPS de la sidebar (`SidebarMenuSub`) : un item de groupe
  // encore marqué `bottom` serait simplement invisible (app-sidebar.tsx sépare les deux listes).
  it('le sous-onglet Configuration range Catalogue + Config du test, aucun en bottom', () => {
    expect(formation.groups?.map((g) => g.id)).toEqual(['config'])
    const inGroup = formation.nav.filter((n) => n.group === 'config')
    expect(inGroup.map((n) => n.href)).toEqual(['/formation/catalogue', '/formation/recrutement/config'])
    expect(inGroup.some((n) => n.bottom)).toBe(false)
    // Recrutement reste un item DIRECT — c'est lui qui porte la pastille (`renderDirect`).
    expect(item('/formation/recrutement').group).toBeUndefined()
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

  // Bug 2026-08-19 : le switcher envoyait TOUJOURS sur nav[0] (Overview = frm-suivi) → un chatter
  // avec le seul droit Entraînement était rebondi par requireAccess vers sa face chatteurs, en
  // boucle. La home d'une face dépend des droits, comme landingHref.
  it('la home de la face dépend des droits (switcher)', () => {
    expect(workspaceHome(formation, user(['frm-entrainement', 'formation']))).toBe('/formation/ma-formation')
    expect(workspaceHome(formation, user(['frm-suivi', 'formation']))).toBe('/formation/overview')
    expect(workspaceHome(formation, { ...user([]), isAdmin: true })).toBe('/formation/overview')
    // Aucune page de la face (droit de face seul) → basePath, jamais une page qui rebondit.
    expect(workspaceHome(formation, user(['formation']))).toBe('/formation')
  })
})
