import { describe, expect, it } from 'vitest'
import type { ScriptDraft } from '@glagency/core'
import { StudioError } from '@glagency/mypuls'
import { RATE_LIMIT_DELAYS_MS, sendScript } from './send'
import { DRAFT, FakeStudio, NO_MEDIA, fail500, msg, noSleep } from './test/fake-studio'

describe('sendScript', () => {
  it('modèle → script → désactivé AVANT le premier message → messages et chemins dans l’ordre → ordre final contrôlé', async () => {
    const s = new FakeStudio()
    expect(await sendScript(s, '290', DRAFT, noSleep)).toEqual({ ok: true, scriptId: 7, media: NO_MEDIA })
    expect(s.log).toEqual([
      'switch 290',
      'createScript',
      'active false',
      'message #1',
      'message #1 — Suite',
      'branch Libre ?',
      'studio',
      'message #3 🔴',
      'message #3 🟢',
      'message #3 🟢 — Suite',
      'message #4',
      'studio',
      'layout',
      'edit #1 [10]',
      'studio',
    ])
    const b = s.state.branches[0]!
    const pathId = (label: string) => b.paths.find((p) => p.label === label)!.id
    expect(s.layout).toEqual([
      { type: 'message', id: 100 },
      { type: 'message', id: 101 },
      { type: 'branch', id: b.id, paths: [{ id: pathId('Non'), messages: [102] }, { id: pathId('Oui'), messages: [103, 104] }] },
      { type: 'message', id: 105 },
    ])
    expect(s.pathOf('#3 🟢')).toBe('Oui')
    expect(s.state.script.isActive).toBe(false)
    // Relance posée APRÈS l'ordre final, sur le bon message (ses suivants existent alors).
    expect(s.state.messages.find((m) => m.title === '#1')!.chainDelays).toEqual([10])
  })

  it('chemins renvoyés dans un autre ordre → appariés par libellé et couleur, jamais par position', async () => {
    const s = new FakeStudio({ reversePaths: true })
    expect(await sendScript(s, '290', DRAFT, noSleep)).toEqual({ ok: true, scriptId: 7, media: NO_MEDIA })
    expect(s.pathOf('#3 🔴')).toBe('Non')
    expect(s.pathOf('#3 🟢 — Suite')).toBe('Oui')
  })

  it('chemin introuvable après création (libellé changé) → échec à l’embranchement, rien rangé au hasard', async () => {
    const s = new FakeStudio({ renameFirstPath: 'Peut-être' })
    expect(await sendScript(s, '290', DRAFT, noSleep)).toMatchObject({
      ok: false,
      step: 'embranchement « Libre ? »',
      error: 'chemin « Non » (red) introuvable dans MyPuls',
    })
    expect(s.log).not.toContain('message #3 🔴')
  })

  it('vraie bascule (/toggle) : désactivé à la création, et le nettoyage ne le RÉACTIVE pas', async () => {
    const ok = new FakeStudio({ toggle: 'flip' })
    expect(await sendScript(ok, '290', DRAFT, noSleep)).toEqual({ ok: true, scriptId: 7, media: NO_MEDIA })
    expect(ok.state.script.isActive).toBe(false)

    const ko = new FakeStudio({ toggle: 'flip', failOn: fail500('message #4') })
    expect(await sendScript(ko, '290', DRAFT, noSleep)).toMatchObject({ ok: false, cleanup: { deactivated: true, renamed: true } })
    expect(ko.state.script.isActive).toBe(false)
    expect(ko.log.filter((c) => c.startsWith('active'))).toEqual(['active false'])
  })

  it('script encore actif à la fin → échec « contrôle final », jamais présenté comme réussi', async () => {
    const s = new FakeStudio({ toggle: 'noop' })
    expect(await sendScript(s, '290', DRAFT, noSleep)).toMatchObject({
      ok: false,
      scriptId: 7,
      step: 'contrôle final',
      error: 'le script est ACTIF dans MyPuls alors qu’il devait être désactivé',
      cleanup: { deactivated: false, renamed: true },
    })
  })

  it('échec en plein envoi → script relu, renommé « ⚠️ INCOMPLET », nettoyage rapporté', async () => {
    const s = new FakeStudio({ failOn: fail500('message #3 🟢') })
    expect(await sendScript(s, '290', DRAFT, noSleep)).toEqual({
      ok: false,
      scriptId: 7,
      step: 'message « #3 🟢 »',
      error: 'message #3 🟢 500',
      cleanup: { deactivated: true, renamed: true },
    })
    expect(s.log.slice(-2)).toEqual(['studio', 'rename ⚠️ INCOMPLET — Soirée révisions'])
    expect(s.state.script.isActive).toBe(false)
  })

  it('relance d’un message DANS un chemin : posée sur ce message, après l’ordre final', async () => {
    const draft: ScriptDraft = {
      ...DRAFT,
      items: DRAFT.items.map((it) =>
        it.type === 'branch'
          ? { ...it, paths: it.paths.map((p) => (p.label === 'Oui' ? { ...p, messages: [msg('#3 🟢', { chainDelays: [20, 30] }), msg('#3 🟢 — Suite')] } : p)) }
          : it,
      ),
    }
    const s = new FakeStudio()
    expect(await sendScript(s, '290', draft, noSleep)).toEqual({ ok: true, scriptId: 7, media: NO_MEDIA })
    expect(s.log.slice(-4)).toEqual(['layout', 'edit #1 [10]', 'edit #3 🟢 [20,30]', 'studio'])
    expect(s.state.messages.find((m) => m.title === '#3 🟢')!.chainDelays).toEqual([20, 30])
  })

  it('relances RELUES après la pose : MyPuls répond OK mais les ignore → échec « contrôle des relances », nettoyé', async () => {
    const s = new FakeStudio({ editQuirk: 'ignore' })
    expect(await sendScript(s, '290', DRAFT, noSleep)).toEqual({
      ok: false,
      scriptId: 7,
      step: 'contrôle des relances',
      error: 'relances de « #1 » : [] dans MyPuls, [10] attendu',
      cleanup: { deactivated: true, renamed: true },
    })
  })

  it('relances RELUES : une modification qui sort un message de son chemin → échec « contrôle des relances »', async () => {
    const draft: ScriptDraft = {
      ...DRAFT,
      items: DRAFT.items.map((it) =>
        it.type === 'branch'
          ? { ...it, paths: it.paths.map((p) => (p.label === 'Non' ? { ...p, messages: [msg('#3 🔴', { chainDelays: [20] })] } : p)) }
          : it,
      ),
    }
    const r = await sendScript(new FakeStudio({ editQuirk: 'root' }), '290', draft, noSleep)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.step).toBe('contrôle des relances')
    expect(r.ok === false && r.error).toBe('« #3 🔴 » a quitté son chemin dans MyPuls après la pose des relances')
  })

  it('refus pendant la pose des relances → échec à cette étape, script désactivé et renommé', async () => {
    const s = new FakeStudio({ failOn: (c) => (c.startsWith('edit #1') ? new StudioError('POST /scripts/7/messages/100/edit 422 : délai trop long', 422) : null) })
    expect(await sendScript(s, '290', DRAFT, noSleep)).toEqual({
      ok: false,
      scriptId: 7,
      step: 'relances de « #1 »',
      error: 'POST /scripts/7/messages/100/edit 422 : délai trop long',
      cleanup: { deactivated: true, renamed: true },
    })
  })
  it('session expirée en plein envoi (tout échoue ensuite) → nettoyage rapporté comme NON fait', async () => {
    let dead = false
    const s = new FakeStudio({
      failOn: (c) => {
        if (c === 'message #4') dead = true
        return dead ? new StudioError(`${c} : redirection 302 (session expirée ?)`, 302) : null
      },
    })
    expect(await sendScript(s, '290', DRAFT, noSleep)).toMatchObject({
      ok: false,
      scriptId: 7,
      step: 'message « #4 »',
      cleanup: { deactivated: null, renamed: false },
    })
    expect(s.state.script.name).toBe('Soirée révisions')
  })

  it('le nettoyage patiente aussi sur un 429', async () => {
    let renameTries = 0
    const waits: number[] = []
    const s = new FakeStudio({
      failOn: (c) => {
        if (c === 'message #4') return new StudioError('message #4 500', 500)
        if (c.startsWith('rename') && renameTries++ === 0) return new StudioError('rename 429', 429)
        return null
      },
    })
    expect(
      await sendScript(s, '290', DRAFT, async (ms) => {
        waits.push(ms)
      }),
    ).toMatchObject({ ok: false, cleanup: { deactivated: true, renamed: true } })
    expect(waits).toEqual([RATE_LIMIT_DELAYS_MS[0]])
  })

  it('échec avant la création du script → rien à nettoyer', async () => {
    const s = new FakeStudio({ failOn: (c) => (c === 'switch 290' ? new StudioError('GET /switch-creator/290 500', 500) : null) })
    expect(await sendScript(s, '290', DRAFT, noSleep)).toEqual({
      ok: false,
      scriptId: null,
      step: 'choix de la modèle',
      error: 'GET /switch-creator/290 500',
      cleanup: null,
    })
    expect(s.log).toEqual(['switch 290'])
  })

  it('429 → attend 30 s puis 60 s et rejoue ; un troisième 429 abandonne', async () => {
    let n = 0
    const waits: number[] = []
    const s = new FakeStudio({ failOn: (c) => (c === 'message #4' && n++ < 2 ? new StudioError('POST /scripts/7/messages/new 429', 429) : null) })
    expect(
      await sendScript(s, '290', DRAFT, async (ms) => {
        waits.push(ms)
      }),
    ).toEqual({ ok: true, scriptId: 7, media: NO_MEDIA })
    expect(waits).toEqual(RATE_LIMIT_DELAYS_MS)
    expect(s.log.filter((c) => c === 'message #4')).toHaveLength(3)

    const always = new FakeStudio({ failOn: (c) => (c === 'message #4' ? new StudioError('POST /scripts/7/messages/new 429', 429) : null) })
    expect(await sendScript(always, '290', DRAFT, noSleep)).toMatchObject({ ok: false, step: 'message « #4 »' })
  })

  it('le Studio ne renvoie pas le nombre de messages créés → erreur, script INCOMPLET', async () => {
    const s = new FakeStudio()
    const orig = s.fetchStudio.bind(s)
    let calls = 0
    s.fetchStudio = async () => {
      const st = await orig()
      if (++calls === 2) st.messages.pop()
      return st
    }
    expect(await sendScript(s, '290', DRAFT, noSleep)).toMatchObject({ ok: false, scriptId: 7, step: 'ordre final' })
  })
})
