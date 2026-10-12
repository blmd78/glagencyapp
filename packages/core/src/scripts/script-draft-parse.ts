import type { DraftBranch, DraftItem, DraftMessage, PathColor, ScriptDraft } from './script-draft'

// ── Lecture de la sortie de l'IA ────────────────────────────────────────────────────────────────
// La sortie structurée garantit déjà le schéma ; cette garde protège d'un JSON reçu par un autre
// chemin (fichier rejoué à la main) et nomme le champ fautif au lieu d'un `undefined` plus loin.

const fail = (path: string): never => {
  throw new Error(`brouillon invalide : ${path}`)
}
const str = (v: unknown, path: string): string => (typeof v === 'string' ? v : fail(path))
const num = (v: unknown, path: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(path))
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path))
const obj = (v: unknown, path: string): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(path)

function parseMessage(v: unknown, path: string): DraftMessage {
  const o = obj(v, path)
  if (o.type !== 'message') fail(`${path}.type`)
  const title = str(o.title, `${path}.title`)
  const content = str(o.content, `${path}.content`)
  const price = num(o.price, `${path}.price`)
  const media = arr(o.media, `${path}.media`).map((x, i) => str(x, `${path}.media[${i}]`))
  const pm = o.pendingMedia === null ? null : obj(o.pendingMedia, `${path}.pendingMedia`)
  return {
    type: 'message',
    title,
    content,
    price,
    media,
    pendingMedia: pm && {
      description: str(pm.description, `${path}.pendingMedia.description`),
      price: num(pm.price, `${path}.pendingMedia.price`),
    },
    chainDelays: arr(o.chainDelays, `${path}.chainDelays`).map((x, i) => num(x, `${path}.chainDelays[${i}]`)),
  }
}

function parseBranch(o: Record<string, unknown>, path: string): DraftBranch {
  return {
    type: 'branch',
    label: str(o.label, `${path}.label`),
    paths: arr(o.paths, `${path}.paths`).map((p, pi) => {
      const at = `${path}.paths[${pi}]`
      const pp = obj(p, at)
      return {
        label: str(pp.label, `${at}.label`),
        color: str(pp.color, `${at}.color`) as PathColor,
        messages: arr(pp.messages, `${at}.messages`).map((m, mi) => parseMessage(m, `${at}.messages[${mi}]`)),
      }
    }),
  }
}

/** Liste facultative d'objets de chaînes (`voiceNotes`, `toComplete`, `autoMessages`) : absente → non posée. */
function strings<K extends string>(v: unknown, path: string, keys: readonly K[]): Array<Record<K, string>> | undefined {
  if (v === undefined) return undefined
  return arr(v, path).map((x, i) => {
    const o = obj(x, `${path}[${i}]`)
    return Object.fromEntries(keys.map((k) => [k, str(o[k], `${path}[${i}].${k}`)])) as Record<K, string>
  })
}

export function parseScriptDraft(json: unknown): ScriptDraft {
  const o = obj(json, 'racine')
  if (typeof o.isSequence !== 'boolean') fail('isSequence')
  const draft: ScriptDraft = {
    name: str(o.name, 'name'),
    description: str(o.description, 'description'),
    isSequence: o.isSequence as boolean,
    items: arr(o.items, 'items').map((it, i): DraftItem => {
      const path = `items[${i}]`
      const item = obj(it, path)
      if (item.type === 'message') return parseMessage(item, path)
      if (item.type === 'branch') return parseBranch(item, path)
      return fail(`${path}.type`)
    }),
  }
  if (o.aiBrief !== undefined) draft.aiBrief = str(o.aiBrief, 'aiBrief')
  const voiceNotes = strings(o.voiceNotes, 'voiceNotes', ['label', 'text', 'direction'] as const)
  const toComplete = strings(o.toComplete, 'toComplete', ['where', 'hint'] as const)
  const autoMessages = strings(o.autoMessages, 'autoMessages', ['trigger', 'message'] as const)
  if (voiceNotes) draft.voiceNotes = voiceNotes
  if (toComplete) draft.toComplete = toComplete
  if (autoMessages) draft.autoMessages = autoMessages
  return draft
}
