import { describe, expect, it } from 'vitest'
import {
  canAccessNav,
  landingHref,
  pageChoicesFor,
  PAGE_SLUGS,
  slugFace,
  subChoicesFor,
  subSlugsOf,
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

// Régression 2026-08-31 : le Récap du tracker est passé `adminOnly + managerAccess` pour s'ouvrir
// à l'encadrement. `canAccessNav` ne consultait pas le slug sur la branche `adminOnly` → l'item
// devenait accessible à tout manager/sous-manager SANS le droit « Présence », et comme il n'est pas
// `bottom`, `landingHref` le rendait comme page d'atterrissage : `requireAccess('presence')`
// renvoyait alors vers `landingHref`, soit la même URL. Boucle de redirection, CRM entier verrouillé.
// Même famille que le bug 2026-08-19 ci-dessus : une nav plus permissive que la garde de la page.
describe('Récap du tracker — adminOnly + managerAccess + slug', () => {
  const chatter = WORKSPACES.find((w) => w.id === 'chatter')!
  const recap = chatter.nav.find((n) => n.href === '/chatter/presence/recap')!
  const membres = chatter.nav.find((n) => n.href === '/chatter/members')!
  const encadrant = (pages: string[]): NavAccess => ({ ...user(pages), isManager: true })
  const profil = (pages: string[]) => ({ role: 'chatteur', superadmin: false, manager: true, pages })

  it('reste invisible de l’encadrant qui n’a pas le droit Présence', () => {
    expect(canAccessNav(recap, encadrant([]))).toBe(false)
    expect(canAccessNav(recap, encadrant(['police']))).toBe(false)
  })

  it('s’affiche pour l’encadrant qui a le droit, et pour l’admin', () => {
    expect(canAccessNav(recap, encadrant(['presence']))).toBe(true)
    expect(canAccessNav(recap, { ...user([]), isAdmin: true })).toBe(true)
  })

  it('ne devient jamais la page d’atterrissage d’un encadrant sans le droit', () => {
    expect(landingHref(profil(['police']))).toBe('/chatter/police')
    expect(landingHref(profil([]))).toBe('/no-access')
    expect(landingHref(profil(['mkt-overview', 'marketing']))).not.toBe('/chatter/presence/recap')
  })

  it('Membres (adminOnly + managerAccess, SANS slug explicite) n’est pas affecté', () => {
    expect(canAccessNav(membres, encadrant([]))).toBe(true)
  })
})

// ── Bouts de page (`<page>:<bout>`) — droits plus fins qu'une page, cf. migration 0139 ────────
describe('bouts de page', () => {
  it('les bouts de l’Overview sont des slugs assignables, rattachés à la face chatteurs', () => {
    expect(PAGE_SLUGS).toContain('overview:ca')
    expect(PAGE_SLUGS).toContain('overview:courbe')
    // Le `:` ne doit pas être confondu avec un préfixe de face secondaire (mkt-*, frm-*).
    expect(slugFace('overview:ca')).toBe('chatter')
    expect(slugFace('overview:courbe')).toBe('chatter')
  })

  // La grille des pages ne doit PAS enfler d'une case par bout : ils sont servis à part, et
  // l'UI ne les rend que sous une page cochée (retour Benoit 2026-09-02).
  it('les bouts ne sont pas dans la grille des pages, mais dans subChoicesFor', () => {
    expect(pageChoicesFor('chatter').map((c) => c.slug)).not.toContain('overview:ca')
    const subs = subChoicesFor('chatter')
    expect(subs.map((c) => c.slug)).toEqual(['overview:ca', 'overview:courbe'])
    expect(subs.every((c) => c.parent === 'overview')).toBe(true)
    // Les bouts de la face chatteurs n'apparaissent pas sur les faces secondaires.
    expect(subChoicesFor('marketing')).toEqual([])
    expect(subChoicesFor('formation')).toEqual([])
  })

  // Un libellé de bout est elliptique par nature : sans description, on accorde un droit sur la
  // foi de deux mots. Ce test force à l'écrire pour tout bout ajouté plus tard.
  it('tout bout explique au survol ce qu’il ouvre', () => {
    for (const sub of subChoicesFor('chatter')) {
      expect(sub.description, `bout ${sub.slug} sans description`).toBeTruthy()
    }
  })

  it('subSlugsOf ne rend les bouts que de la page qui en a', () => {
    expect(subSlugsOf('overview')).toEqual(['overview:ca', 'overview:courbe'])
    expect(subSlugsOf('compta')).toEqual([])
  })

  // Un bout N'EST PAS une page : il n'a ni item de nav ni route. Sans ce garde-fou, un membre
  // n'ayant QUE `overview:ca` passerait `atLeastOnePage` puis atterrirait sur /no-access,
  // `landingHref` ne sachant résoudre que les slugs portés par un item de nav.
  it('un bout seul n’ouvre aucune nav et n’est jamais une page d’atterrissage', () => {
    const overview = WORKSPACES.find((w) => w.id === 'chatter')!.nav.find((n) => n.href === '/chatter/overview')!
    expect(canAccessNav(overview, user(['overview:ca']))).toBe(false)
    expect(canAccessNav(overview, user(['overview', 'overview:ca']))).toBe(true)
    expect(
      landingHref({ role: 'chatteur', superadmin: false, manager: false, pages: ['overview:ca'] }),
    ).toBe('/no-access')
  })
})

// Le Relevé d'équipe (2026-09-04) est devenu le PREMIER item du groupe Présence, devant « Suivi
// chatters ». Deux effets de bord passent par là, et tous deux sont voulus — ce test les fixe
// pour qu'un futur réordonnancement de la nav ne les change pas par accident.
//
// 1. `landingHref` rend le premier item accessible : un porteur de « Présence » seul atterrit
//    donc désormais sur le Relevé. Sa garde est `requireAccess('presence')`, la même que le
//    droit testé — donc AUCUNE boucle de redirection (le bug du Récap, plus haut, venait
//    précisément d'une nav plus permissive que la garde).
// 2. `PAGE_CHOICES` prend le libellé du GROUPE dès qu'un slug est porté par plusieurs items :
//    la case à cocher de Membres doit rester « Présence », pas devenir « Relevé d'équipe ».
//    Sans ça, un admin croirait à un droit nouveau à distribuer sur 230 membres.
describe('Relevé d’équipe en tête du groupe Présence', () => {
  const chatter = WORKSPACES.find((w) => w.id === 'chatter')!
  const releve = chatter.nav.find((n) => n.href === '/chatter/presence')!

  it('est la page d’atterrissage d’un porteur de « Présence » seul, sans boucle', () => {
    expect(canAccessNav(releve, user(['presence']))).toBe(true)
    expect(
      landingHref({ role: 'chatteur', superadmin: false, manager: false, pages: ['presence'] }),
    ).toBe('/chatter/presence')
  })

  it('reste invisible sans le droit — la nav ne dépasse pas la garde de la page', () => {
    expect(canAccessNav(releve, user([]))).toBe(false)
    expect(canAccessNav(releve, user(['police']))).toBe(false)
  })

  it('n’ajoute AUCUNE case à cocher dans Membres : le slug reste « presence », libellé du groupe', () => {
    const presence = pageChoicesFor('chatter').filter((c) => c.slug === 'presence')
    expect(presence).toHaveLength(1)
    expect(presence[0]!.label).toBe('Présence')
  })
})
