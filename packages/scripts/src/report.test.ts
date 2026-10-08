import { describe, expect, it } from 'vitest'
import { describeFailure, describeMedia, formatReport } from './report'

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
        '14 messages à média : rattachés à l\'envoi si les médias portent ce libellé dans MyM (collection du même nom que le script), sinon « 🖼️ À RATTACHER » dans le Studio',
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

describe('describeMedia', () => {
  const base = { collection: 'Script-Chambre 2', reason: null }
  it('bilan en MESSAGES à média (un pack de 3 médias = 1 message) : complétés depuis la collection, restés à rattacher', () => {
    expect(describeMedia({ ...base, attached: 3, pending: 0 })).toBe('3 messages à média complétés depuis la collection « Script-Chambre 2 »')
    expect(describeMedia({ ...base, attached: 1, pending: 2 })).toBe(
      '1 message à média complété depuis la collection « Script-Chambre 2 », 2 à rattacher dans le Studio',
    )
    expect(describeMedia({ attached: 0, pending: 0, collection: null, reason: null })).toBe('')
  })
  it('rien de rattaché : la cause précise', () => {
    const none = (reason: 'absente' | 'ambiguë' | 'illisible' | 'trop de médias' | 'invalide', collection: string | null = null) =>
      describeMedia({ attached: 0, pending: 2, collection, reason })
    expect(none('absente')).toBe('2 messages à média à rattacher dans le Studio (aucune collection au nom du script)')
    expect(none('ambiguë')).toBe('2 messages à média à rattacher dans le Studio (plusieurs collections au nom du script)')
    expect(none('illisible')).toBe('2 messages à média à rattacher dans le Studio (bibliothèque MyPuls illisible)')
    expect(none('trop de médias', 'X')).toBe('2 messages à média à rattacher dans le Studio (collection « X » trop grosse pour être lue)')
    expect(none('invalide', 'X')).toBe('2 messages à média à rattacher dans le Studio (rattachement refusé par la vérification)')
    expect(describeMedia({ attached: 0, pending: 1, collection: 'X', reason: null })).toBe('1 message à média à rattacher dans le Studio (aucun média titré comme le script dans « X »)')
  })
})
