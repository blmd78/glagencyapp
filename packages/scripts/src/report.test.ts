import { describe, expect, it } from 'vitest'
import { describeFailure, formatReport } from './report'

describe('describeFailure', () => {
  const base = { ok: false as const, scriptId: 42, step: 'message « #4 »', error: 'POST … 500' }
  it('nettoyage fait : désactivé et renommé', () => {
    expect(describeFailure({ ...base, cleanup: { deactivated: true, renamed: true } }, 'Soirée')).toBe(
      'ÉCHEC à l’étape « message « #4 » » : POST … 500\nscript 42 désactivé et renommé « ⚠️ INCOMPLET — Soirée » : à supprimer dans le Studio.',
    )
  })
  it('nettoyage impossible : le dit, sans rien affirmer', () => {
    expect(describeFailure({ ...base, cleanup: { deactivated: null, renamed: false } }, 'Soirée')).toBe(
      'ÉCHEC à l’étape « message « #4 » » : POST … 500\n' +
        'script 42 : état actif/désactivé ILLISIBLE et renommage IMPOSSIBLE — il garde le nom « Soirée » : à vérifier et supprimer dans le Studio.',
    )
  })
  it('script resté actif : alerte', () => {
    expect(describeFailure({ ...base, cleanup: { deactivated: false, renamed: true } }, 'Soirée')).toBe(
      'ÉCHEC à l’étape « message « #4 » » : POST … 500\nscript 42 TOUJOURS ACTIF et renommé « ⚠️ INCOMPLET — Soirée » : le désactiver tout de suite dans le Studio, puis le supprimer.',
    )
  })
  it('rien de créé', () => {
    expect(describeFailure({ ...base, scriptId: null, cleanup: null }, 'Soirée')).toBe(
      'ÉCHEC à l’étape « message « #4 » » : POST … 500\naucun script créé.',
    )
  })
})

describe('formatReport', () => {
  it('résumé, mode, puis erreurs situées', () => {
    expect(
      formatReport({ sequence: true, messages: 87, branches: 9, paid: 6, pendingMedia: 14, totalPrice: 703 }, [
        { where: 'élément 4 « #4 »', message: '9 chemins (max 8)' },
      ]),
    ).toBe(
      [
        '87 messages · 9 embranchements · 6 PPV · total 703 €',
        'mode : séquence (le chat déroule le script, les embranchements deviennent des boutons de réponse)',
        '14 médias à rattacher dans le Studio (titres « 🖼️ À RATTACHER »)',
        '1 erreur — rien ne sera envoyé :',
        '  • élément 4 « #4 » : 9 chemins (max 8)',
      ].join('\n'),
    )
  })
  it('ajustements listés avant le verdict', () => {
    expect(
      formatReport({ sequence: true, messages: 77, branches: 7, paid: 0, pendingMedia: 0, totalPrice: 0 }, [], [
        { where: 'Message automatique 1', message: 'relance de 7 s portée à 10 s (minimum MyPuls)' },
      ]),
    ).toBe(
      [
        '77 messages · 7 embranchements · 0 PPV · total 0 €',
        'mode : séquence (le chat déroule le script, les embranchements deviennent des boutons de réponse)',
        '1 ajustement :',
        '  • Message automatique 1 : relance de 7 s portée à 10 s (minimum MyPuls)',
        '0 erreur — prêt à envoyer',
      ].join('\n'),
    )
  })
  it('banque de messages, sans erreur', () => {
    expect(formatReport({ sequence: false, messages: 3, branches: 0, paid: 0, pendingMedia: 0, totalPrice: 0 }, [])).toBe(
      '3 messages · 0 embranchement · 0 PPV · total 0 €\nmode : banque de messages (choisis à la main, sans ordre imposé)\n0 erreur — prêt à envoyer',
    )
  })
})
