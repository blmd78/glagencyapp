import { describe, expect, it } from 'vitest'
import { validateScriptDraft, type DraftMessage, type ScriptDraft } from './script-draft'
import { WRITTEN_VOICE_SUFFIX, writeMissingVoices } from './voice-fallback'

const msg = (over: Partial<DraftMessage> = {}): DraftMessage => ({
  type: 'message',
  title: '#13 🔴 — S’il n’ouvre pas',
  content: '.',
  price: 0,
  media: [],
  pendingMedia: { description: 'VOCAL 1 – t’as pas ouvert… ?', price: 0 },
  chainDelays: [],
  ...over,
})
const draft = (items: ScriptDraft['items']): ScriptDraft => ({
  name: 'Soirée révisions',
  description: 'Vente',
  isSequence: true,
  items,
  voiceNotes: [{ label: 'VOCAL 1', text: 't’as pas ouvert… ? j’avoue j’ai hésité', direction: 'timide · environ 10 s' }],
})

describe('writeMissingVoices', () => {
  it('vocal resté à rattacher : part à l’écrit avec son texte, titre marqué comme le dit le prompt V3', () => {
    const { draft: d, written } = writeMissingVoices(draft([msg()]))
    expect(written).toBe(1)
    expect(d.items[0]).toEqual(
      msg({ title: `#13 🔴 — S’il n’ouvre pas${WRITTEN_VOICE_SUFFIX}`, content: 't’as pas ouvert… ? j’avoue j’ai hésité', pendingMedia: null }),
    )
    expect(validateScriptDraft(d)).toEqual([])
  })

  it('aussi dans un chemin d’embranchement', () => {
    const d = draft([{ type: 'branch', label: 'Il ouvre ?', paths: [{ label: 'Il n’ouvre pas', color: 'red', messages: [msg()] }] }])
    expect(writeMissingVoices(d).written).toBe(1)
  })

  it('ne touche pas : un vocal déjà rattaché, un PPV, une bulle qui a déjà du texte, un vocal sans texte connu', () => {
    const d = draft([
      msg({ media: ['0b6f3c1e-9a7d-4c1b-8f0e-2d7a5b9c4e11'], pendingMedia: null }),
      msg({ pendingMedia: { description: 'PPV 2 – déshabillage', price: 8 } }),
      msg({ content: 'écoute ça 🙈' }),
      msg({ pendingMedia: { description: 'VOCAL 7 – …', price: 0 } }),
    ])
    expect(writeMissingVoices(d)).toEqual({ draft: d, written: 0 })
  })

  it('libellé ambigu : deux vocaux « VOCAL 1 » différents, ou deux textes pour le même → rien n’est écrit', () => {
    const twoDescriptions = draft([msg(), msg({ pendingMedia: { description: 'VOCAL 1 – autre chose', price: 0 } })])
    expect(writeMissingVoices(twoDescriptions).written).toBe(0)
    const twoTexts: ScriptDraft = { ...draft([msg()]), voiceNotes: [{ label: 'VOCAL 1', text: 'a', direction: '' }, { label: 'VOCAL 1', text: 'b', direction: '' }] }
    expect(writeMissingVoices(twoTexts).written).toBe(0)
  })

  it('audio présent dans la collection (titre « VOCAL 1 ») : pas « pas encore fait », rien n’est écrit', () => {
    expect(writeMissingVoices(draft([msg()]), new Set(['vocal 1'])).written).toBe(0)
  })

  it('libellés comparés comme les médias : « 🎙️ VOCAL 1 » et caractères invisibles', () => {
    const d: ScriptDraft = { ...draft([msg({ pendingMedia: { description: 'VOCAL\u200b 1 – t’as pas ouvert', price: 0 } })]), voiceNotes: [{ label: '🎙️ VOCAL 1', text: 'coucou', direction: '' }] }
    expect(writeMissingVoices(d).written).toBe(1)
  })

  it('brouillon sans vocaux (d’avant le 2026-10-12) : rendu tel quel', () => {
    const d: ScriptDraft = { name: 'x', description: '', isSequence: true, items: [msg()] }
    expect(writeMissingVoices(d)).toEqual({ draft: d, written: 0 })
  })

  it('titre long : coupé pour garder le suffixe sous les 255 caractères', () => {
    const { draft: d } = writeMissingVoices(draft([msg({ title: 'x'.repeat(250) })]))
    const title = (d.items[0] as DraftMessage).title
    expect(title.length).toBe(255)
    expect(title.endsWith(WRITTEN_VOICE_SUFFIX)).toBe(true)
  })
})
