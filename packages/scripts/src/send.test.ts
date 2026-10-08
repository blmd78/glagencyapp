import { describe, expect, it } from 'vitest'
import type { DraftMessage, ScriptDraft } from '@glagency/core'
import { StudioError, type LayoutItem, type StudioState } from '@glagency/mypuls'
import { RATE_LIMIT_DELAYS_MS, sendScript, type StudioWriter } from './send'

const msg = (title: string, over: Partial<DraftMessage> = {}): DraftMessage => ({
  type: 'message',
  title,
  content: title,
  price: 0,
  media: [],
  pendingMedia: null,
  chainDelays: [],
  ...over,
})
const DRAFT: ScriptDraft = {
  name: 'Soirée révisions',
  description: 'Vente',
  isSequence: true,
  items: [
    msg('#1', { chainDelays: [10] }),
    msg('#1 — Suite'),
    {
      type: 'branch',
      label: 'Libre ?',
      paths: [
        { label: 'Non', color: 'red', messages: [msg('#3 🔴')] },
        { label: 'Oui', color: 'green', messages: [msg('#3 🟢'), msg('#3 🟢 — Suite')] },
      ],
    },
    msg('#4'),
  ],
}

interface FakeOptions {
  /** Fait échouer un appel donné (par son nom dans le journal). */
  failOn?: (call: string) => Error | null
  /** `set` applique l'état demandé ; `flip` bascule quel que soit l'argument (vraie bascule) ; `noop` ignore. */
  toggle?: 'set' | 'flip' | 'noop'
  /** Le serveur renvoie les chemins dans l'ordre inverse. */
  reversePaths?: boolean
  /** Le serveur renomme le 1er chemin (réponse inattendue). */
  renameFirstPath?: string
  /** `msgEdit` répond OK mais : `ignore` les relances, ou `root` sort le message de son chemin. */
  editQuirk?: 'ignore' | 'root'
}

/** Studio MyPuls en mémoire : ids croissants, comme le vrai ; script créé ACTIF, comme le défaut du Studio. */
class FakeStudio implements StudioWriter {
  log: string[] = []
  state: StudioState = { script: { id: 0, name: '', isActive: true }, branches: [], messages: [] }
  layout: LayoutItem[] | null = null
  private next = 100
  constructor(private o: FakeOptions = {}) {}
  private hit(call: string) {
    this.log.push(call)
    const e = this.o.failOn?.(call)
    if (e) throw e
  }
  async switchCreator(id: string) {
    this.hit(`switch ${id}`)
  }
  async createScript(fields: Record<string, string>) {
    this.hit('createScript')
    this.state.script = { id: 7, name: fields.name ?? '', isActive: true }
    return 7
  }
  async setScriptActive(_id: number, active: boolean) {
    this.hit(`active ${active}`)
    const mode = this.o.toggle ?? 'set'
    if (mode === 'set') this.state.script.isActive = active
    if (mode === 'flip') this.state.script.isActive = !this.state.script.isActive
  }
  async renameScript(_id: number, fields: Record<string, string>) {
    this.hit(`rename ${fields.name}`)
    this.state.script.name = fields.name ?? ''
  }
  async createBranch(_id: number, body: { label: string; paths: Array<{ label: string; color: string }> }) {
    this.hit(`branch ${body.label}`)
    // Numérotation RÉELLE (capture scripts-2849) : embranchements 1..n par script, chemins 1..n par
    // embranchement — deux embranchements ont donc chacun un chemin `id: 1`.
    let paths = body.paths.map((p, i) => ({ id: i + 1, ...p }))
    if (this.o.renameFirstPath && paths[0]) paths[0] = { ...paths[0], label: this.o.renameFirstPath }
    if (this.o.reversePaths) paths = [...paths].reverse()
    this.state.branches.push({ id: this.state.branches.length + 1, label: body.label, paths })
  }
  async createMessage(_id: number, fields: Record<string, string>, path?: { branchId: number; pathId: number }) {
    this.hit(`message ${fields.title}`)
    // Comme MyPuls (test réel du 2026-10-08, script 9865) : une relance vise les messages qui SUIVENT,
    // le Studio la refuse à la création — elle se pose ensuite, en modification.
    if ((JSON.parse(fields.chain_delays_json ?? '[]') as number[]).length) {
      throw new StudioError(`POST /scripts/7/messages/new 422 : relance sans message suivant`, 422)
    }
    this.state.messages.push({
      id: this.next++,
      position: this.state.messages.length + 1,
      title: fields.title ?? '',
      content: fields.content ?? '',
      price: Number(fields.price),
      medias: [],
      chainDelays: JSON.parse(fields.chain_delays_json ?? '[]') as number[],
      branchId: path?.branchId ?? null,
      branchPath: path?.pathId ?? null,
    })
  }
  async editMessage(_id: number, messageId: number, fields: Record<string, string>) {
    this.hit(`edit ${fields.title} ${fields.chain_delays_json}`)
    const m = this.state.messages.find((x) => x.id === messageId)
    if (!m) throw new StudioError(`POST /scripts/7/messages/${messageId}/edit 404`, 404)
    if (this.o.editQuirk === 'root') {
      m.branchId = null
      m.branchPath = null
    }
    if (this.o.editQuirk !== 'ignore') m.chainDelays = JSON.parse(fields.chain_delays_json ?? '[]') as number[]
  }
  async fetchStudio() {
    this.hit('studio')
    return structuredClone(this.state)
  }
  async saveLayout(_id: number, items: LayoutItem[]) {
    this.hit('layout')
    this.layout = items
  }
  pathOf(title: string): string | undefined {
    const m = this.state.messages.find((x) => x.title === title)
    return this.state.branches.flatMap((b) => b.paths).find((p) => p.id === m?.branchPath)?.label
  }
}
const noSleep = async () => {}
const fail500 = (call: string) => (c: string) => (c === call ? new StudioError(`${call} 500`, 500) : null)

describe('sendScript', () => {
  it('modèle → script → désactivé AVANT le premier message → messages et chemins dans l’ordre → ordre final contrôlé', async () => {
    const s = new FakeStudio()
    expect(await sendScript(s, '290', DRAFT, noSleep)).toEqual({ ok: true, scriptId: 7 })
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
    expect(await sendScript(s, '290', DRAFT, noSleep)).toEqual({ ok: true, scriptId: 7 })
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
    expect(await sendScript(ok, '290', DRAFT, noSleep)).toEqual({ ok: true, scriptId: 7 })
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
    expect(await sendScript(s, '290', draft, noSleep)).toEqual({ ok: true, scriptId: 7 })
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
    ).toEqual({ ok: true, scriptId: 7 })
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
