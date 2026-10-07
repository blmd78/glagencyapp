import { describe, expect, it } from 'vitest'
import type { DraftMessage, ScriptDraft } from './script-draft'
import { branchBody, messageFields, scriptFields } from './script-requests'

const msg = (over: Partial<DraftMessage> = {}): DraftMessage => ({
  type: 'message',
  title: '#12 🟢 — PPV 2',
  content: 'tiens…',
  price: 0,
  media: [],
  pendingMedia: null,
  chainDelays: [],
  ...over,
})

describe('scriptFields', () => {
  const d: ScriptDraft = { name: 'Soirée révisions', description: 'Vente après KYC', isSequence: true, items: [] }
  it('reprend les champs du formulaire de création du Studio', () => {
    expect(scriptFields(d)).toEqual({ name: 'Soirée révisions', description: 'Vente après KYC', ai_brief: '', is_sequence: '1', used_ratio: '' })
  })
  it('accepte un autre nom (renommage INCOMPLET)', () => {
    expect(scriptFields(d, '⚠️ INCOMPLET — Soirée révisions').name).toBe('⚠️ INCOMPLET — Soirée révisions')
  })
})

describe('messageFields', () => {
  it('sérialise prix, médias (ids MYM en nombres, vocaux en UUID) et relances', () => {
    expect(messageFields(msg({ price: 25, media: ['74970496', '0b6f3c1e-9a7d-4c1b-8f0e-2d7a5b9c4e11'], chainDelays: [10, 60] }))).toEqual({
      title: '#12 🟢 — PPV 2',
      content: 'tiens…',
      price: '25',
      medias_json: '[74970496,"0b6f3c1e-9a7d-4c1b-8f0e-2d7a5b9c4e11"]',
      chain_delays_json: '[10,60]',
    })
  })
  it('média à rattacher : la consigne et le prix prévu partent dans le titre', () => {
    expect(messageFields(msg({ pendingMedia: { description: 'PHOTO 2 – les fesses', price: 25 } })).title).toBe(
      '#12 🟢 — PPV 2 · 🖼️ À RATTACHER : PHOTO 2 – les fesses · 🔒 25 €',
    )
    expect(messageFields(msg({ pendingMedia: { description: 'Photo 1', price: 0 } })).title).toBe('#12 🟢 — PPV 2 · 🖼️ À RATTACHER : Photo 1')
  })
})

describe('branchBody', () => {
  it('garde libellé et chemins (libellé + couleur), sans les messages', () => {
    expect(
      branchBody({
        type: 'branch',
        label: 'Il est libre ?',
        paths: [
          { label: 'Non', color: 'red', messages: [msg()] },
          { label: 'Oui', color: 'green', messages: [] },
        ],
      }),
    ).toEqual({ label: 'Il est libre ?', paths: [{ label: 'Non', color: 'red' }, { label: 'Oui', color: 'green' }] })
  })
})
