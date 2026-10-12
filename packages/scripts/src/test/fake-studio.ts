import type { DraftMessage, ScriptDraft } from '@glagency/core'
import { StudioError, type LayoutItem, type StudioState } from '@glagency/mypuls'
import type { StudioWriter } from '../send'

/** Studio MyPuls en mémoire et brouillons de test, partagés par `send.test.ts` et `send-media.test.ts`. */
export const msg = (title: string, over: Partial<DraftMessage> = {}): DraftMessage => ({
  type: 'message',
  title,
  content: title,
  price: 0,
  media: [],
  pendingMedia: null,
  chainDelays: [],
  ...over,
})
export const DRAFT: ScriptDraft = {
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

export interface FakeOptions {
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
  /** Bibliothèque de la modèle : collections (nom → médias titrés). */
  library?: Record<string, Array<{ id: string; type: string; title: string }>>
}

/** Studio MyPuls en mémoire : ids croissants, comme le vrai ; script créé ACTIF, comme le défaut du Studio. */
export class FakeStudio implements StudioWriter {
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
      medias: JSON.parse(fields.medias_json ?? '[]') as number[],
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
  async listCollections() {
    this.hit('collections')
    return Object.keys(this.o.library ?? {}).map((name, i) => ({ id: String(i + 1), name }))
  }
  async listCollectionMedia(collectionId: string) {
    this.hit(`collection ${collectionId}`)
    const name = Object.keys(this.o.library ?? {})[Number(collectionId) - 1]
    return (this.o.library?.[name ?? ''] ?? []).map(({ id, type }) => ({ id, type }))
  }
  async mediaTitle(mediaId: string) {
    this.hit(`titre ${mediaId}`)
    return Object.values(this.o.library ?? {}).flat().find((m) => m.id === mediaId)?.title ?? ''
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
/** Aucun média à rattacher dans le brouillon : la bibliothèque n’est pas lue. */
export const NO_MEDIA = { attached: 0, pending: 0, collection: null, reason: null }
export const noSleep = async () => {}
export const fail500 = (call: string) => (c: string) => (c === call ? new StudioError(`${call} 500`, 500) : null)
