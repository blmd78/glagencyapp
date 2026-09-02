import { describe, expect, it, vi } from 'vitest'

// authz.ts importe des modules lourds (next/headers via @/lib/auth, cookies via
// @/lib/supabase/server, @glagency/db) — mockés pour isoler mergePages, seule fonction pure
// testée ici (@glagency/core est pur, pas besoin de mock).
vi.mock('@/lib/auth', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@glagency/db', () => ({ createAdminClient: vi.fn() }))

import { mergePages } from './authz'
import { memberDefaults } from './components/member-defaults'
import type { Member } from './types'

describe('mergePages', () => {
  it('pose le droit de face formation dès qu’une page frm-* est cochée, et préserve les autres faces', () => {
    expect(mergePages(['overview', 'mkt-liens', 'marketing'], ['frm-entrainement'], 'formation'))
      .toEqual(['overview', 'mkt-liens', 'marketing', 'frm-entrainement', 'formation'])
  })
  it('retire le droit de face quand plus aucune page de la face n’est cochée', () => {
    expect(mergePages(['overview', 'frm-suivi', 'formation'], [], 'formation')).toEqual(['overview'])
  })
  it('remplace les slugs de la face courante sans toucher aux autres', () => {
    expect(mergePages(['frm-suivi', 'formation', 'overview'], ['frm-entrainement'], 'formation'))
      .toEqual(['overview', 'frm-entrainement', 'formation'])
  })
  it('face chatteurs : pas de droit de face', () => {
    expect(mergePages(['frm-suivi', 'formation'], ['overview', 'insights'], 'chatter'))
      .toEqual(['frm-suivi', 'formation', 'overview', 'insights'])
  })
})

// RÉGRESSION ÉVITÉE DE JUSTESSE (2026-09-02) : `mergePages` ne garde que les pages des AUTRES
// faces plus celles que le form renvoie, et `slugFace('overview:ca')` vaut `chatter`. Quand les
// bouts sont sortis de la grille des pages, `memberDefaults` a failli cesser de les recharger —
// ouvrir une fiche puis l'enregistrer sans rien toucher aurait effacé le droit, en silence.
describe('bouts de page — aller-retour form → mergePages', () => {
  const membre = (pages: string[]) =>
    ({
      id: 'm1', email: 'x@y.z', displayName: 'X', role: 'sous-manager', pages,
      creatorIds: [], managerIds: [], workLink: '', closingRole: null, closingTeam: null,
      shift: null, isNew: false, arrivedAt: null, chatterId: null, orgExcluded: false,
    }) as unknown as Member

  const defaults = (pages: string[]) =>
    memberDefaults({ member: membre(pages), scope: 'chatter', viewer: 'admin', creators: [] })

  it('recharge le bout dans le form', () => {
    expect(defaults(['overview', 'overview:ca']).pages).toEqual(['overview', 'overview:ca'])
  })

  it('enregistrer sans rien toucher CONSERVE le bout', () => {
    const existing = ['overview', 'overview:ca', 'frm-suivi', 'formation']
    expect(mergePages(existing, defaults(existing).pages, 'chatter')).toContain('overview:ca')
  })
})
