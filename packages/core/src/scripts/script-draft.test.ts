import { describe, expect, it } from 'vitest'
import {
  normalizeDraft,
  parseScriptDraft,
  summarizeDraft,
  validateScriptDraft,
  type DraftBranch,
  type DraftMessage,
  type ScriptDraft,
} from './script-draft'

const msg = (over: Partial<DraftMessage> = {}): DraftMessage => ({
  type: 'message',
  title: '#1 — Transition',
  content: 'et du coup…',
  price: 0,
  media: [],
  pendingMedia: null,
  chainDelays: [],
  ...over,
})
const branch = (over: Partial<DraftBranch> = {}): DraftBranch => ({
  type: 'branch',
  label: 'Il est libre ?',
  paths: [
    { label: 'Il n’est pas libre', color: 'red', messages: [msg({ title: '#3 🔴 — Pas libre' })] },
    { label: 'Il est libre', color: 'green', messages: [msg({ title: '#3 🟢 — Libre' })] },
  ],
  ...over,
})
const draft = (items: ScriptDraft['items']): ScriptDraft => ({ name: 'Soirée révisions', description: 'Vente', isSequence: false, items })
const messages = (errs: { message: string }[]) => errs.map((e) => e.message)

describe('validateScriptDraft', () => {
  it('accepte un brouillon conforme (message, embranchement, PPV avec média, relances)', () => {
    const d = draft([
      msg({ chainDelays: [10, 12] }),
      msg({ title: '#1 — Suite' }),
      msg({ title: '#1 — Suite' }),
      branch(),
      msg({ title: '#4 — PPV 2', price: 25, media: ['74970496', '76783012'] }),
      msg({ title: '#5 — Vocal', media: ['0b6f3c1e-9a7d-4c1b-8f0e-2d7a5b9c4e11'] }),
    ])
    expect(validateScriptDraft(d)).toEqual([])
  })

  it('exige un nom et au moins un élément', () => {
    expect(messages(validateScriptDraft({ name: ' ', description: '', isSequence: false, items: [] }))).toEqual([
      'nom du script vide',
      'aucun message',
    ])
  })

  it('exige un texte et un titre sur chaque message, même avec un média (le Studio les impose)', () => {
    expect(messages(validateScriptDraft(draft([msg({ content: '  ' })])))).toEqual(['message sans texte (MyPuls l’exige)'])
    expect(messages(validateScriptDraft(draft([msg({ content: '', media: ['1'] })])))).toEqual(['message sans texte (MyPuls l’exige)'])
    expect(messages(validateScriptDraft(draft([msg({ title: ' ' })])))).toEqual(['message sans titre (MyPuls l’exige)'])
  })

  it('plafonne le titre FINAL (suffixe « À RATTACHER » compris) à 255 caractères', () => {
    expect(validateScriptDraft(draft([msg({ title: 'x'.repeat(255) })]))).toEqual([])
    expect(
      messages(validateScriptDraft(draft([msg({ title: 'x'.repeat(230), pendingMedia: { description: 'PHOTO 2 – les fesses', price: 25 } })]))),
    ).toEqual(['titre de 281 caractères une fois « À RATTACHER » ajouté (max 255)'])
  })

  it('plafonne le nom du script en gardant la place du préfixe « ⚠️ INCOMPLET — »', () => {
    expect(validateScriptDraft({ ...draft([msg()]), name: 'x'.repeat(145) })).toEqual([])
    expect(messages(validateScriptDraft({ ...draft([msg()]), name: 'x'.repeat(146) }))).toEqual([
      'nom de 146 caractères (max 145, place gardée pour « ⚠️ INCOMPLET — »)',
    ])
  })

  it('refuse un prix hors 5 → 1000 € et un message payant sans média', () => {
    expect(messages(validateScriptDraft(draft([msg({ price: 3, media: ['1'] })])))).toEqual(['prix 3 € hors de 5 → 1000 €'])
    expect(messages(validateScriptDraft(draft([msg({ price: 1200, media: ['1'] })])))).toEqual(['prix 1200 € hors de 5 → 1000 €'])
    expect(messages(validateScriptDraft(draft([msg({ price: 12 })])))).toEqual([
      'message payant sans média (MyPuls le refuse) : passer le média en « à rattacher » à 0 €',
    ])
  })

  it('refuse un prix non entier (le Studio ne prend que des euros entiers)', () => {
    expect(messages(validateScriptDraft(draft([msg({ price: 9.99, media: ['1'] })])))).toEqual(['prix 9.99 € non entier'])
    expect(messages(validateScriptDraft(draft([msg({ pendingMedia: { description: 'PPV', price: 9.5 } })])))).toEqual(['prix 9.5 € non entier'])
  })

  it('plafonne les médias et le texte avec média (déjà joint ou à rattacher)', () => {
    expect(messages(validateScriptDraft(draft([msg({ media: ['1', '2', '3', '4', '5', '6'] })])))).toEqual(['6 médias (max 5)'])
    expect(messages(validateScriptDraft(draft([msg({ media: ['1'], content: 'x'.repeat(501) })])))).toEqual([
      'texte de 501 caractères avec un média (max 500)',
    ])
    expect(
      messages(validateScriptDraft(draft([msg({ pendingMedia: { description: 'Photo 1', price: 0 }, content: 'x'.repeat(501) })]))),
    ).toEqual(['texte de 501 caractères avec un média (max 500)'])
    expect(messages(validateScriptDraft(draft([msg({ media: ['abc'] })])))).toEqual(['id de média invalide « abc »'])
  })

  it('média à rattacher : prix 0 sur le message, description et prix du média contrôlés', () => {
    expect(validateScriptDraft(draft([msg({ pendingMedia: { description: 'PHOTO 2 – les fesses', price: 25 } })]))).toEqual([])
    expect(
      messages(validateScriptDraft(draft([msg({ price: 25, media: ['1'], pendingMedia: { description: 'PPV 2', price: 25 } })]))),
    ).toEqual(['média à rattacher : le message doit rester à 0 € et sans média'])
    expect(messages(validateScriptDraft(draft([msg({ pendingMedia: { description: ' ', price: 2 } })])))).toEqual([
      'média à rattacher sans description',
      'prix 2 € hors de 5 → 1000 €',
    ])
  })

  it('contrôle les relances : nombre, délai minimal, horizon', () => {
    const eleven = Array.from({ length: 11 }, () => 10)
    const followers = Array.from({ length: 11 }, () => msg({ title: 'Suite' }))
    expect(messages(validateScriptDraft(draft([msg({ chainDelays: eleven }), ...followers])))).toEqual(['11 relances (max 10)'])
    expect(messages(validateScriptDraft(draft([msg({ chainDelays: [5] }), msg()])))).toEqual(['relance de 5 s (min 10 s)'])
    expect(messages(validateScriptDraft(draft([msg({ chainDelays: [172_800, 10] }), msg(), msg()])))).toEqual([
      'relances sur 172810 s (max 172800 s)',
    ])
  })

  it('relances > messages qui suivent dans la même liste → erreur (un embranchement coupe la suite)', () => {
    expect(messages(validateScriptDraft(draft([msg({ chainDelays: [10, 10] }), msg(), branch()])))).toEqual([
      '2 relances mais 1 message(s) à la suite',
    ])
  })

  it('embranchement : 1 à 8 chemins, libellés, couleurs, chemins non vides', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ label: `cas ${i}`, color: 'grey' as const, messages: [msg()] }))
    expect(messages(validateScriptDraft(draft([branch({ paths: nine })])))).toEqual(['9 chemins (max 8)'])
    expect(messages(validateScriptDraft(draft([branch({ paths: [] })])))).toEqual(['embranchement sans chemin'])
    expect(messages(validateScriptDraft(draft([branch({ label: '' })])))).toEqual(['embranchement sans libellé'])
    expect(messages(validateScriptDraft(draft([branch({ paths: [{ label: '', color: 'pink' as never, messages: [] }] })])))).toEqual([
      'chemin sans libellé',
      'couleur « pink » inconnue',
      'chemin vide',
    ])
  })

  it('plafonne les libellés : embranchement 160, chemin 80', () => {
    expect(messages(validateScriptDraft(draft([branch({ label: 'q'.repeat(161) })])))).toEqual(['libellé de 161 caractères (max 160)'])
    expect(
      messages(validateScriptDraft(draft([branch({ paths: [{ label: 'c'.repeat(81), color: 'red', messages: [msg()] }] })]))),
    ).toEqual(['libellé de chemin de 81 caractères (max 80)'])
  })

  it('situe chaque erreur (élément, chemin, message)', () => {
    const errs = validateScriptDraft(
      draft([msg(), branch({ paths: [{ label: 'a', color: 'red', messages: [msg({ price: 3, media: ['1'] })] }] })]),
    )
    expect(errs).toEqual([{ where: 'élément 2 · chemin 1 « a » · message 1 « #1 — Transition »', message: 'prix 3 € hors de 5 → 1000 €' }])
  })
})

describe('normalizeDraft', () => {
  it('porte au minimum du Studio un délai trop court, partout, et le note', () => {
    const d = draft([
      msg({ title: 'Message automatique 1', chainDelays: [7, 10] }),
      msg(),
      msg(),
      branch({ paths: [{ label: 'a', color: 'red', messages: [msg({ title: 'N3', chainDelays: [3] }), msg()] }] }),
    ])
    const { draft: out, notes } = normalizeDraft(d)
    expect(out.items[0]).toMatchObject({ chainDelays: [10, 10] })
    expect(out.items[3]).toMatchObject({ paths: [{ messages: [{ chainDelays: [10] }, { chainDelays: [] }] }] })
    expect(notes).toEqual([
      { where: 'Message automatique 1', message: 'relance de 7 s portée à 10 s (minimum MyPuls)' },
      { where: 'N3', message: 'relance de 3 s portée à 10 s (minimum MyPuls)' },
    ])
    expect(validateScriptDraft(out)).toEqual([])
  })
  it('arrondit à l’euro le plus proche un prix non entier (posé ou prévu), et le note', () => {
    const d = draft([msg({ title: 'PPV 1', price: 9.99, media: ['1'] }), msg({ title: 'PPV 2', pendingMedia: { description: 'vidéo', price: 24.4 } })])
    const { draft: out, notes } = normalizeDraft(d)
    expect(out.items[0]).toMatchObject({ price: 10 })
    expect(out.items[1]).toMatchObject({ pendingMedia: { description: 'vidéo', price: 24 } })
    expect(notes).toEqual([
      { where: 'PPV 1', message: 'prix 9.99 € arrondi à 10 € (MyPuls : euros entiers)' },
      { where: 'PPV 2', message: 'prix 24.4 € arrondi à 24 € (MyPuls : euros entiers)' },
    ])
    expect(validateScriptDraft(out)).toEqual([])
  })
  it('ne touche pas un brouillon conforme', () => {
    const d = draft([msg({ chainDelays: [10, 60] }), msg(), msg()])
    expect(normalizeDraft(d)).toEqual({ draft: d, notes: [] })
  })
})

describe('summarizeDraft', () => {
  it('compte messages, embranchements, PPV, médias à rattacher et total', () => {
    const d = draft([
      msg(),
      branch(),
      msg({ price: 25, media: ['1'] }),
      msg({ pendingMedia: { description: 'PPV 3', price: 60 } }),
      msg({ pendingMedia: { description: 'Photo 2', price: 0 } }),
    ])
    expect(summarizeDraft(d)).toEqual({ sequence: false, messages: 6, branches: 1, paid: 2, pendingMedia: 2, totalPrice: 85 })
    expect(summarizeDraft({ ...d, isSequence: true }).sequence).toBe(true)
  })
})

describe('parseScriptDraft', () => {
  it('rend un brouillon bien formé tel quel', () => {
    const d = draft([msg(), branch()])
    expect(parseScriptDraft(JSON.parse(JSON.stringify(d)))).toEqual(d)
  })
  it('nomme le chemin fautif', () => {
    expect(() => parseScriptDraft({ name: 'x', description: '', isSequence: false, items: [{ type: 'message', title: 't' }] })).toThrow(
      'brouillon invalide : items[0].content',
    )
    expect(() => parseScriptDraft({ name: 'x', description: '', isSequence: false, items: [{ type: 'autre' }] })).toThrow(
      'brouillon invalide : items[0].type',
    )
  })
})
