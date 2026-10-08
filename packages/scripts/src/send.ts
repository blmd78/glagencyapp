import { INCOMPLETE_PREFIX, branchBody, messageFields, scriptFields, type DraftMessage, type ScriptDraft } from '@glagency/core'
import {
  StudioError,
  createBranch,
  createMessage,
  createScript,
  editMessage,
  fetchStudio,
  renameScript,
  saveLayout,
  setScriptActive,
  switchCreator,
  type LayoutItem,
  type StudioState,
} from '@glagency/mypuls'

/**
 * Envoi d'un brouillon VÉRIFIÉ (validateScriptDraft sans erreur) dans le Studio MyPuls.
 *
 * Ordre : modèle de la session → script → désactivé AVANT le premier message (un script actif à
 * moitié rempli serait proposé aux chatteurs) → éléments dans l'ordre du brouillon, SANS relances →
 * ordre final → relances. Une relance vise les messages qui SUIVENT : MyPuls la refuse à la création
 * (422, test réel du 2026-10-08) ; le Studio la pose en modification, une fois les suivants en place.
 * Le Studio ne renvoie pas l'id d'un message créé : on relit son état (`fetchStudio`) après chaque
 * embranchement (pour les ids de ses chemins) et à la fin (pour poser l'ordre), et on apparie par
 * ordre de création — le script est neuf, tout ce qu'il contient vient de nous.
 *
 * Échec après la création : le script reste désactivé et prend le nom « ⚠️ INCOMPLET — … ». Pas de
 * reprise : relancer crée un nouveau script, l'incomplet se supprime à la main dans le Studio.
 */
export interface StudioWriter {
  switchCreator(creatorMypulsId: string): Promise<void>
  createScript(fields: Record<string, string>): Promise<number>
  setScriptActive(id: number, active: boolean): Promise<void>
  renameScript(id: number, fields: Record<string, string>): Promise<void>
  createBranch(scriptId: number, body: { label: string; paths: Array<{ label: string; color: string }> }): Promise<void>
  createMessage(scriptId: number, fields: Record<string, string>, path?: { branchId: number; pathId: number }): Promise<void>
  editMessage(scriptId: number, messageId: number, fields: Record<string, string>): Promise<void>
  fetchStudio(scriptId: number): Promise<StudioState>
  saveLayout(scriptId: number, items: LayoutItem[]): Promise<void>
}

/** Le vrai Studio, sur une session MyPuls ouverte par `login()`. */
export function studioWriter(cookie: string): StudioWriter {
  return {
    switchCreator: (id) => switchCreator(id, cookie),
    createScript: (fields) => createScript(cookie, fields),
    setScriptActive: (id, active) => setScriptActive(cookie, id, active),
    renameScript: (id, fields) => renameScript(cookie, id, fields),
    createBranch: (scriptId, body) => createBranch(cookie, scriptId, body),
    createMessage: (scriptId, fields, path) => createMessage(cookie, scriptId, fields, path),
    editMessage: (scriptId, messageId, fields) => editMessage(cookie, scriptId, messageId, fields),
    fetchStudio: (scriptId) => fetchStudio(cookie, scriptId),
    saveLayout: (scriptId, items) => saveLayout(cookie, scriptId, items),
  }
}

/**
 * Ce que le nettoyage a VRAIMENT obtenu après un échec — la commande l'affiche tel quel au lieu
 * d'annoncer un renommage qui n'a pas eu lieu (session morte, 429 persistant).
 * `deactivated` : `true` relu désactivé, `false` relu ACTIF, `null` état illisible.
 */
export interface Cleanup {
  deactivated: boolean | null
  renamed: boolean
}
export type SendResult =
  | { ok: true; scriptId: number }
  | { ok: false; scriptId: number | null; step: string; error: string; cleanup: Cleanup | null }

/** Attentes avant les 2e et 3e tentatives sur un 429 — même règle que `identity-backfill` (MyPuls bloque ~1 min). */
export const RATE_LIMIT_DELAYS_MS = [30_000, 60_000]
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Rejoue `fn` sur un 429 seulement : toute autre erreur pourrait avoir écrit, la rejouer ferait un doublon. */
async function on429<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const delay = RATE_LIMIT_DELAYS_MS[attempt]
      if (!(e instanceof StudioError) || e.status !== 429 || delay === undefined) throw e
      console.warn(`[script] MyPuls 429 — nouvelle tentative dans ${delay / 1000} s`)
      await sleep(delay)
    }
  }
}

class StepError extends Error {
  constructor(
    readonly step: string,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause))
  }
}

type CreatedBranch = { branchId: number; pathIds: number[] }

export async function sendScript(
  writer: StudioWriter,
  creatorMypulsId: string,
  draft: ScriptDraft,
  sleep: (ms: number) => Promise<void> = realSleep,
): Promise<SendResult> {
  let scriptId: number | null = null
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await on429(fn, sleep)
    } catch (e) {
      throw new StepError(name, e)
    }
  }
  try {
    await step('choix de la modèle', () => writer.switchCreator(creatorMypulsId))
    scriptId = await step('création du script', () => writer.createScript(scriptFields(draft)))
    const id = scriptId
    await step('désactivation du script', () => writer.setScriptActive(id, false))

    const sendMessage = (m: DraftMessage, path?: { branchId: number; pathId: number }) =>
      step(`message « ${m.title} »`, () => writer.createMessage(id, { ...messageFields(m), chain_delays_json: '[]' }, path))
    // Embranchements créés, dans l'ordre du brouillon : sert à apparier les ids à la fin.
    const created: CreatedBranch[] = []
    for (const it of draft.items) {
      if (it.type === 'message') {
        await sendMessage(it)
        continue
      }
      const at = `embranchement « ${it.label} »`
      await step(at, () => writer.createBranch(id, branchBody(it)))
      const st = await step(at, () => writer.fetchStudio(id))
      const known = new Set(created.map((c) => c.branchId))
      const b = st.branches.filter((x) => !known.has(x.id)).sort((x, y) => y.id - x.id)[0]
      if (!b) throw new StepError(at, new Error('embranchement introuvable après création'))
      // Ids LOCAUX au script (capture scripts-2849 : embranchements 1..n, chemins 1..n par embranchement) :
      // le nouvel embranchement est le plus grand id inconnu. Chemins appariés par (libellé, couleur),
      // jamais par position : un ordre différent rangerait en silence les 🔴 dans le 🟢.
      const pathIds = it.paths.map((p) => {
        const hits = b.paths.filter((x) => x.label === p.label && x.color === p.color)
        if (hits.length !== 1) {
          throw new StepError(at, new Error(`chemin « ${p.label} » (${p.color}) ${hits.length ? 'en double' : 'introuvable'} dans MyPuls`))
        }
        return hits[0]!.id
      })
      created.push({ branchId: b.id, pathIds })
      for (const [pi, p] of it.paths.entries()) {
        for (const m of p.messages) await sendMessage(m, { branchId: b.id, pathId: pathIds[pi]! })
      }
    }

    const final = await step('ordre final', () => writer.fetchStudio(id))
    // L'état « désactivé » est RELU, pas supposé : l'adresse s'appelle /toggle.
    if (final.script.isActive) {
      throw new StepError('contrôle final', new Error('le script est ACTIF dans MyPuls alors qu’il devait être désactivé'))
    }
    const { layout, placed } = buildLayout(draft, created, final)
    await step('ordre final', () => writer.saveLayout(id, layout))
    const chained = placed.filter((p) => p.message.chainDelays.length)
    for (const { message, id: messageId } of chained) {
      await step(`relances de « ${message.title} »`, () => writer.editMessage(id, messageId, messageFields(message)))
    }
    if (chained.length) {
      // RELU, pas supposé (même principe que « désactivé ») : la modification n'envoie pas le chemin, on
      // vérifie qu'elle a bien posé les relances ET laissé chaque message à sa place.
      const after = await step('contrôle des relances', () => writer.fetchStudio(id))
      for (const { message, id: messageId } of chained) {
        const before = final.messages.find((m) => m.id === messageId)
        const now = after.messages.find((m) => m.id === messageId)
        const fail = (why: string) => new StepError('contrôle des relances', new Error(why))
        if (!before || !now) throw fail(`« ${message.title} » introuvable dans MyPuls après la pose des relances`)
        if (now.branchId !== before.branchId || now.branchPath !== before.branchPath) {
          throw fail(`« ${message.title} » a quitté son chemin dans MyPuls après la pose des relances`)
        }
        const got = (now.chainDelays ?? []).map(Number)
        if (JSON.stringify(got) !== JSON.stringify(message.chainDelays)) {
          throw fail(`relances de « ${message.title} » : ${JSON.stringify(got)} dans MyPuls, ${JSON.stringify(message.chainDelays)} attendu`)
        }
      }
    }
    return { ok: true, scriptId: id }
  } catch (e) {
    const err = e instanceof StepError ? e : new StepError('envoi', e)
    const cleaned = scriptId === null ? null : await cleanup(writer, scriptId, draft, sleep)
    return { ok: false, scriptId, step: err.step, error: err.message, cleanup: cleaned }
  }
}

/**
 * Après un échec : relire l'état, ne désactiver QUE si le script est actif (une vraie bascule
 * réactiverait sinon un script à moitié rempli), puis renommer « ⚠️ INCOMPLET — … ». Chaque geste
 * patiente sur un 429 ; ce qui échoue quand même est rapporté, jamais annoncé comme fait.
 */
async function cleanup(writer: StudioWriter, id: number, draft: ScriptDraft, sleep: (ms: number) => Promise<void>): Promise<Cleanup> {
  const retry = <T>(fn: () => Promise<T>) => on429(fn, sleep)
  let deactivated: boolean | null
  try {
    let st = await retry(() => writer.fetchStudio(id))
    if (st.script.isActive) {
      await retry(() => writer.setScriptActive(id, false))
      st = await retry(() => writer.fetchStudio(id))
    }
    deactivated = !st.script.isActive
  } catch {
    deactivated = null
  }
  let renamed: boolean
  try {
    await retry(() => writer.renameScript(id, scriptFields(draft, `${INCOMPLETE_PREFIX}${draft.name}`)))
    renamed = true
  } catch {
    renamed = false
  }
  return { deactivated, renamed }
}

/**
 * Ordre final du Studio : ids appariés par ordre de création, par liste (racine, puis chaque chemin).
 * `placed` : chaque message du brouillon avec son id MyPuls — sert à poser les relances ensuite.
 */
function buildLayout(
  draft: ScriptDraft,
  created: CreatedBranch[],
  st: StudioState,
): { layout: LayoutItem[]; placed: Array<{ message: DraftMessage; id: number }> } {
  const byId = [...st.messages].sort((a, b) => a.id - b.id)
  const root = byId.filter((m) => m.branchId === null).map((m) => m.id)
  const inPath = (branchId: number, pathId: number) => byId.filter((m) => m.branchId === branchId && m.branchPath === pathId).map((m) => m.id)
  const expectedRoot = draft.items.filter((it) => it.type === 'message').length
  if (root.length !== expectedRoot) {
    throw new StepError('ordre final', new Error(`${root.length} message(s) à la racine dans MyPuls, ${expectedRoot} attendu(s)`))
  }
  let r = 0
  let b = 0
  const placed: Array<{ message: DraftMessage; id: number }> = []
  const layout = draft.items.map((it): LayoutItem => {
    if (it.type === 'message') {
      const id = root[r++]!
      placed.push({ message: it, id })
      return { type: 'message', id }
    }
    const c = created[b++]!
    return {
      type: 'branch',
      id: c.branchId,
      paths: it.paths.map((p, pi) => {
        const pathId = c.pathIds[pi]!
        const ids = inPath(c.branchId, pathId)
        if (ids.length !== p.messages.length) {
          throw new StepError('ordre final', new Error(`chemin « ${p.label} » : ${ids.length} message(s) dans MyPuls, ${p.messages.length} attendu(s)`))
        }
        p.messages.forEach((m, mi) => placed.push({ message: m, id: ids[mi]! }))
        return { id: pathId, messages: ids }
      }),
    }
  })
  return { layout, placed }
}
