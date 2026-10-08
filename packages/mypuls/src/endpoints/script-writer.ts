import { BASE_URL, UA } from '../client'

/**
 * Écriture dans le Studio de scripts MyPuls — les MÊMES requêtes que son propre code
 * (`cdn.mypuls.app/assets/js/pages/script-studio-*.js`, relevé du 2026-10-06) : cookie de session +
 * `X-Requested-With`, FormData pour script et messages, JSON pour embranchements, ordre et
 * activation. Pas de jeton CSRF à la création (seules les suppressions en exigent un — et ce module
 * ne supprime rien). Le script est créé sur la modèle COURANTE de la session : `switchCreator` d'abord.
 *
 * Pas d'API publique : un changement du Studio casse ces appels. Les redirections ne sont pas
 * suivies — une session morte renvoie vers /login, et suivre ferait passer la page de login pour un succès.
 */
export class StudioError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'StudioError'
  }
}

export interface StudioMessage {
  id: number
  position: number
  title: string
  content: string
  price: number
  medias: Array<string | number>
  chainDelays: number[]
  branchId: number | null
  branchPath: number | null
}
export interface StudioBranch {
  id: number
  label: string
  paths: Array<{ id: number; label: string; color: string }>
}
export interface StudioState {
  script: { id: number; name: string; isActive: boolean }
  branches: StudioBranch[]
  messages: StudioMessage[]
}
export type LayoutItem =
  | { type: 'message'; id: number }
  | { type: 'branch'; id: number; paths: Array<{ id: number; messages: number[] }> }

async function call(
  cookie: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: { form: Record<string, string> } | { json: unknown },
): Promise<unknown> {
  const headers: Record<string, string> = {
    Cookie: cookie,
    'User-Agent': UA,
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
  }
  let payload: FormData | string | undefined
  if (body && 'form' in body) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(body.form)) fd.set(k, v)
    payload = fd
  } else if (body) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body.json)
  }
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload, redirect: 'manual' })
  if (res.status >= 300 && res.status < 400) throw new StudioError(`${method} ${path} : redirection ${res.status} (session expirée ?)`, res.status)
  if (!res.ok) {
    // Le Studio renvoie la raison d'un refus dans `{ error }` (cf. son `http()`) : sans elle, un 422 ne dit pas pourquoi.
    const reason = ((await res.json().catch(() => null)) as { error?: unknown } | null)?.error
    throw new StudioError(`${method} ${path} ${res.status}${typeof reason === 'string' && reason ? ` : ${reason}` : ''}`, res.status)
  }
  if (res.status === 204) return null
  return res.json().catch(() => null)
}

export async function createScript(cookie: string, fields: Record<string, string>): Promise<number> {
  const j = (await call(cookie, 'POST', '/scripts/new', { form: fields })) as { id?: unknown } | null
  const id = Number(j?.id)
  if (!Number.isInteger(id) || id <= 0) throw new StudioError('POST /scripts/new : réponse sans id', 200)
  return id
}

export async function renameScript(cookie: string, id: number, fields: Record<string, string>): Promise<void> {
  await call(cookie, 'POST', `/scripts/${id}/edit`, { form: fields })
}

export async function setScriptActive(cookie: string, id: number, active: boolean): Promise<void> {
  await call(cookie, 'PATCH', `/scripts/${id}/toggle`, { json: { isActive: active } })
}

export async function createBranch(
  cookie: string,
  scriptId: number,
  body: { label: string; paths: Array<{ label: string; color: string }> },
): Promise<void> {
  await call(cookie, 'POST', `/scripts/${scriptId}/branches/new`, { json: body })
}

export async function createMessage(
  cookie: string,
  scriptId: number,
  fields: Record<string, string>,
  path?: { branchId: number; pathId: number },
): Promise<void> {
  const form = path ? { ...fields, branch_id: String(path.branchId), branch_path: String(path.pathId) } : fields
  await call(cookie, 'POST', `/scripts/${scriptId}/messages/new`, { form })
}

/**
 * Modifie un message existant (route `msgEdit` du Studio, mêmes champs qu'à la création, sans chemin).
 * Sert à poser les relances APRÈS coup : une relance vise les messages qui SUIVENT, ils doivent exister.
 */
export async function editMessage(cookie: string, scriptId: number, messageId: number, fields: Record<string, string>): Promise<void> {
  await call(cookie, 'POST', `/scripts/${scriptId}/messages/${messageId}/edit`, { form: fields })
}

export async function fetchStudio(cookie: string, scriptId: number): Promise<StudioState> {
  const j = (await call(cookie, 'GET', `/scripts/${scriptId}/studio`)) as Partial<StudioState> | null
  if (!j?.script || !Array.isArray(j.branches) || !Array.isArray(j.messages)) {
    throw new StudioError(`GET /scripts/${scriptId}/studio : réponse inattendue`, 200)
  }
  // Le Studio normalise lui-même chaque id par Number() : la forme exacte (nombre ou chaîne) n'est
  // pas garantie — et un `===` entre 3 et '3' rangerait des messages au mauvais endroit.
  const idOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    script: { ...j.script, id: Number(j.script.id) },
    // Champs nommés un à un : la réponse porte aussi `before` (id du message suivant), inutilisé ici —
    // le recopier tel quel ferait sortir un champ hors type (et non normalisé).
    branches: j.branches.map((b) => ({
      id: Number(b.id),
      label: b.label,
      paths: (b.paths ?? []).map((p) => ({ id: Number(p.id), label: p.label, color: p.color })),
    })),
    messages: j.messages.map((m) => ({ ...m, id: Number(m.id), branchId: idOrNull(m.branchId), branchPath: idOrNull(m.branchPath) })),
  }
}

export async function saveLayout(cookie: string, scriptId: number, items: LayoutItem[]): Promise<void> {
  await call(cookie, 'PATCH', `/scripts/${scriptId}/layout`, { json: { items } })
}
