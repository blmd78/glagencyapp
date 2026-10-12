import { describe, expect, it } from 'vitest'
import type { ScriptDraft } from '@glagency/core'
import { StudioError } from '@glagency/mypuls'
import { sendScript } from './send'
import { DRAFT, FakeStudio, NO_MEDIA, msg, noSleep } from './test/fake-studio'

describe('sendScript — médias rattachés par titre, depuis la collection du même nom que le script', () => {
  const withMedia: ScriptDraft = {
    ...DRAFT,
    items: [
      msg('#1', { chainDelays: [10] }),
      msg('#2 PPV', { pendingMedia: { description: 'PPV 1 – 2 médias', price: 12 } }),
      msg('#3 photo', { pendingMedia: { description: 'PHOTO 9 – inconnue', price: 0 } }),
    ],
  }
  const library = {
    'Pack 2': [{ id: '501', type: 'photo', title: 'PPV 1' }],
    'Soirée révisions (1)': [
      { id: '21', type: 'photo', title: 'PPV 1' },
      { id: '22', type: 'video', title: 'ppv 1' },
    ],
  }
  it('PPV au titre identique : LES médias de la collection du script partent (pas ceux d’une autre), prix posé', async () => {
    const s = new FakeStudio({ library })
    expect(await sendScript(s, '290', withMedia, noSleep)).toEqual({
      ok: true,
      scriptId: 7,
      media: { attached: 1, pending: 1, collection: 'Soirée révisions (1)', reason: null },
    })
    const ppv = s.state.messages.find((m) => m.title.startsWith('#2 PPV'))!
    expect(ppv).toMatchObject({ title: '#2 PPV · 🖼️ PPV 1 – 2 médias', price: 12, medias: [21, 22] })
    expect(s.state.messages.some((m) => m.title.startsWith('#3 photo · 🖼️ À RATTACHER : PHOTO 9'))).toBe(true)
    // La bibliothèque est lue APRÈS le choix de la modèle (elle est celle de la modèle courante).
    expect(s.log.indexOf('collections')).toBeGreaterThan(s.log.indexOf('switch 290'))
  })
  it('collection cherchée d’abord au TITRE NOTION (le nom du brouillon vient de la conversion)', async () => {
    const s = new FakeStudio({ library: { 'Soirée · Emma': library['Soirée révisions (1)'] } })
    const r = await sendScript(s, '290', withMedia, noSleep, { scriptTitle: 'Soirée · Emma' })
    expect(r.ok && r.media).toEqual({ attached: 1, pending: 1, collection: 'Soirée · Emma', reason: null })
  })
  it('deux collections au nom du script : ambigu, rien n’est rattaché', async () => {
    const s = new FakeStudio({ library: { 'Soirée révisions': [], 'Soirée révisions (1)': library['Soirée révisions (1)'] } })
    const r = await sendScript(s, '290', withMedia, noSleep)
    expect(r.ok && r.media).toEqual({ attached: 0, pending: 2, collection: null, reason: 'ambiguë' })
  })
  it('bibliothèque illisible (panne ou 429) : pas d’attente, l’envoi continue, tout reste « à rattacher »', async () => {
    const s = new FakeStudio({ failOn: (c) => (c === 'collections' ? new StudioError('GET /api/collections 429', 429) : null) })
    expect(await sendScript(s, '290', withMedia, noSleep)).toEqual({
      ok: true,
      scriptId: 7,
      media: { attached: 0, pending: 2, collection: null, reason: 'illisible' },
    })
    expect(s.log.filter((c) => c === 'collections')).toHaveLength(1)
  })
  it('collection trop grosse (plus de 60 médias) : pas de rafale de lectures, tout reste « à rattacher »', async () => {
    const big = Array.from({ length: 61 }, (_, i) => ({ id: String(1000 + i), type: 'photo', title: 'PPV 1' }))
    const s = new FakeStudio({ library: { 'Soirée révisions': big } })
    const r = await sendScript(s, '290', withMedia, noSleep)
    expect(r.ok && r.media).toEqual({ attached: 0, pending: 2, collection: 'Soirée révisions', reason: 'trop de médias' })
    expect(s.log.some((c) => c.startsWith('titre '))).toBe(false)
  })
  it('bibliothèque illisible : l’audio existe peut-être, aucun vocal n’est passé à l’écrit', async () => {
    const withVoice: ScriptDraft = {
      ...DRAFT,
      items: [msg('#1'), msg('#13', { content: '.', pendingMedia: { description: 'VOCAL 1 – t’as pas ouvert', price: 0 } })],
      voiceNotes: [{ label: 'VOCAL 1', text: 't’as pas ouvert', direction: '' }],
    }
    const s = new FakeStudio({ failOn: (c) => (c === 'collections' ? new StudioError('GET /api/collections 429', 429) : null) })
    const r = await sendScript(s, '290', withVoice, noSleep)
    expect(r.ok && r.media).toEqual({ attached: 0, pending: 1, collection: null, reason: 'illisible' })
    expect(s.state.messages.find((m) => m.title.startsWith('#13'))?.content).toBe('.')
  })
  it('pas de collection au nom du script : le vocal part à l’écrit', async () => {
    const withVoice: ScriptDraft = {
      ...DRAFT,
      items: [msg('#1'), msg('#13', { content: '.', pendingMedia: { description: 'VOCAL 1 – t’as pas ouvert', price: 0 } })],
      voiceNotes: [{ label: 'VOCAL 1', text: 't’as pas ouvert', direction: '' }],
    }
    const r = await sendScript(new FakeStudio({ library: {} }), '290', withVoice, noSleep)
    expect(r.ok && r.media).toEqual({ attached: 0, pending: 0, collection: null, reason: 'absente', writtenVoices: 1 })
  })
  it('vocal sans audio dans MyM : envoyé à l’écrit avec son texte, titre « pas encore fait » (prompt V3)', async () => {
    const withVoice: ScriptDraft = {
      ...DRAFT,
      items: [msg('#1'), msg('#13 🔴 — S’il n’ouvre pas', { content: '.', pendingMedia: { description: 'VOCAL 1 – t’as pas ouvert… ?', price: 0 } })],
      voiceNotes: [{ label: 'VOCAL 1', text: 't’as pas ouvert… ? j’avoue j’ai hésité', direction: 'timide · 10 s' }],
    }
    const s = new FakeStudio({ library: { 'Soirée révisions': [] } })
    const r = await sendScript(s, '290', withVoice, noSleep)
    expect(r.ok && r.media).toEqual({ attached: 0, pending: 0, collection: 'Soirée révisions', reason: null, writtenVoices: 1 })
    const sent = s.state.messages.find((m) => m.title.startsWith('#13'))!
    expect(sent.title).toBe('#13 🔴 — S’il n’ouvre pas (pas encore fait donc à l’écrit en attendant)')
    expect(sent.content).toBe('t’as pas ouvert… ? j’avoue j’ai hésité')
  })
  it('aucun média à rattacher : la bibliothèque n’est pas lue', async () => {
    const s = new FakeStudio({ library: { 'Soirée révisions': [] } })
    expect(await sendScript(s, '290', DRAFT, noSleep)).toEqual({ ok: true, scriptId: 7, media: NO_MEDIA })
    expect(s.log).not.toContain('collections')
  })
})
