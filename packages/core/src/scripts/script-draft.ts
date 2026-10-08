import { messageFields } from './script-requests'

/**
 * Brouillon d'un script du Studio MyPuls, produit depuis une page Notion par `script-mypuls`
 * (apps/ingestion) et vérifié ICI, en entier, avant toute écriture chez MyPuls.
 *
 * Les limites sont celles du Studio (page `/scripts`, objets `policy` et `chainLimits`, relevé du
 * 2026-10-06) : les dépasser ferait échouer l'envoi au milieu — d'où une vérification complète
 * d'abord, et une seule règle de plus que le Studio n'en contrôle côté navigateur : un message
 * payant exige un média.
 */
export const SCRIPT_LIMITS = {
  maxMedias: 5,
  priceMin: 5,
  priceMax: 1000,
  contentMaxWithMedia: 500,
  maxPaths: 8,
  maxChainLinks: 10,
  minChainDelay: 10,
  maxChainHorizon: 172_800,
  // Champs du Studio (`maxlength` du formulaire, studio.js) — le prix y est un entier (`parseInt`, `step="1"`).
  titleMax: 255,
  nameMax: 160,
  branchLabelMax: 160,
  pathLabelMax: 80,
} as const

/** Préfixe posé sur un script dont l'envoi a échoué — le nom doit lui laisser la place. */
export const INCOMPLETE_PREFIX = '⚠️ INCOMPLET — '

export const PATH_COLORS = ['green', 'orange', 'red', 'blue', 'yellow', 'purple', 'grey'] as const
export type PathColor = (typeof PATH_COLORS)[number]

/** Média décrit dans Notion mais pas encore identifié chez MyPuls : le manager le rattache dans le Studio. */
export interface PendingMedia {
  description: string
  /** Prix prévu du PPV (0 = média gratuit) — affiché dans le titre, posé à la main avec le média. */
  price: number
}

export interface DraftMessage {
  type: 'message'
  title: string
  /** Bulle recopiée à l'identique, consignes « (…) » comprises — comme les scripts saisis à la main. */
  content: string
  price: number
  /** Ids MYM (chiffres) ou ids de vocaux MyPuls (UUID). */
  media: string[]
  pendingMedia: PendingMedia | null
  /** Secondes avant chacun des messages suivants envoyés automatiquement à la suite de celui-ci. */
  chainDelays: number[]
}
export interface DraftPath {
  label: string
  color: PathColor
  messages: DraftMessage[]
}
export interface DraftBranch {
  type: 'branch'
  label: string
  paths: DraftPath[]
}
export type DraftItem = DraftMessage | DraftBranch
export interface ScriptDraft {
  name: string
  description: string
  isSequence: boolean
  items: DraftItem[]
}

export interface DraftError {
  where: string
  message: string
}
export interface DraftSummary {
  /** Séquence (le chat déroule le script, embranchements = boutons) ou banque de messages (sans ordre). */
  sequence: boolean
  messages: number
  branches: number
  /** Messages payants : prix posé, ou média à rattacher avec un prix prévu. */
  paid: number
  pendingMedia: number
  /** Somme des prix (posés et prévus), en euros. */
  totalPrice: number
}

const MEDIA_ID = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
const euros = (n: number) => `${n} €`

function priceErrors(price: number): string[] {
  if (!Number.isFinite(price) || price < 0) return [`prix ${price} invalide`]
  if (!Number.isInteger(price)) return [`prix ${euros(price)} non entier`]
  if (price > 0 && (price < SCRIPT_LIMITS.priceMin || price > SCRIPT_LIMITS.priceMax)) {
    return [`prix ${euros(price)} hors de ${SCRIPT_LIMITS.priceMin} → ${euros(SCRIPT_LIMITS.priceMax)}`]
  }
  return []
}

/** Erreurs d'un message ; `followers` = messages qui le suivent dans la même liste, avant un embranchement. */
function messageErrors(m: DraftMessage, followers: number): string[] {
  const out: string[] = []
  // Le Studio refuse un message sans titre ou sans texte (« Le titre et le message sont obligatoires »).
  if (!m.title.trim()) out.push('message sans titre (MyPuls l’exige)')
  if (!m.content.trim()) out.push('message sans texte (MyPuls l’exige)')
  // Le titre ENVOYÉ porte le suffixe « À RATTACHER » : c'est lui que le Studio borne.
  const sentTitle = messageFields(m).title
  if (sentTitle.length > SCRIPT_LIMITS.titleMax) {
    const why = m.pendingMedia ? ' une fois « À RATTACHER » ajouté' : ''
    out.push(`titre de ${sentTitle.length} caractères${why} (max ${SCRIPT_LIMITS.titleMax})`)
  }
  out.push(...priceErrors(m.price))
  if (m.price > 0 && m.media.length === 0 && !m.pendingMedia) {
    out.push('message payant sans média (MyPuls le refuse) : passer le média en « à rattacher » à 0 €')
  }
  if (m.media.length > SCRIPT_LIMITS.maxMedias) out.push(`${m.media.length} médias (max ${SCRIPT_LIMITS.maxMedias})`)
  for (const id of m.media) if (!MEDIA_ID.test(id)) out.push(`id de média invalide « ${id} »`)
  // Un média à rattacher compte déjà : une fois joint, le Studio refuserait d'enregistrer le message.
  if ((m.media.length > 0 || m.pendingMedia) && m.content.length > SCRIPT_LIMITS.contentMaxWithMedia) {
    out.push(`texte de ${m.content.length} caractères avec un média (max ${SCRIPT_LIMITS.contentMaxWithMedia})`)
  }
  if (m.pendingMedia) {
    if (m.price !== 0 || m.media.length > 0) out.push('média à rattacher : le message doit rester à 0 € et sans média')
    if (!m.pendingMedia.description.trim()) out.push('média à rattacher sans description')
    out.push(...priceErrors(m.pendingMedia.price))
  }
  const d = m.chainDelays
  if (d.length > SCRIPT_LIMITS.maxChainLinks) out.push(`${d.length} relances (max ${SCRIPT_LIMITS.maxChainLinks})`)
  else {
    for (const s of d) if (!Number.isInteger(s) || s < SCRIPT_LIMITS.minChainDelay) out.push(`relance de ${s} s (min ${SCRIPT_LIMITS.minChainDelay} s)`)
    const total = d.reduce((a, b) => a + b, 0)
    if (total > SCRIPT_LIMITS.maxChainHorizon) out.push(`relances sur ${total} s (max ${SCRIPT_LIMITS.maxChainHorizon} s)`)
    if (d.length > followers) out.push(`${d.length} relances mais ${followers} message(s) à la suite`)
  }
  return out
}

/** Nombre de messages qui suivent `list[i]` sans embranchement entre eux. */
function followersAt(list: DraftItem[], i: number): number {
  let n = 0
  for (let k = i + 1; list[k]?.type === 'message'; k++) n++
  return n
}

export function validateScriptDraft(d: ScriptDraft): DraftError[] {
  const errors: DraftError[] = []
  const push = (where: string, msgs: string[]) => msgs.forEach((message) => errors.push({ where, message }))
  const nameMax = SCRIPT_LIMITS.nameMax - INCOMPLETE_PREFIX.length
  if (!d.name.trim()) push('script', ['nom du script vide'])
  else if (d.name.length > nameMax) {
    push('script', [`nom de ${d.name.length} caractères (max ${nameMax}, place gardée pour « ${INCOMPLETE_PREFIX.trim()} »)`])
  }
  // Page sans script rédigé (page de référence, prompt, PDF joint) : la conversion ne trouve rien.
  if (d.items.length === 0) push('script', ['aucun message trouvé : cette page n’est pas un script rédigé (page d’exemple, prompt, PDF joint ?)'])
  d.items.forEach((it, i) => {
    const at = `élément ${i + 1}`
    if (it.type === 'message') {
      push(`${at} « ${it.title} »`, messageErrors(it, followersAt(d.items, i)))
      return
    }
    const own: string[] = []
    if (!it.label.trim()) own.push('embranchement sans libellé')
    if (it.label.length > SCRIPT_LIMITS.branchLabelMax) own.push(`libellé de ${it.label.length} caractères (max ${SCRIPT_LIMITS.branchLabelMax})`)
    if (it.paths.length === 0) own.push('embranchement sans chemin')
    if (it.paths.length > SCRIPT_LIMITS.maxPaths) own.push(`${it.paths.length} chemins (max ${SCRIPT_LIMITS.maxPaths})`)
    push(at, own)
    it.paths.forEach((p, pi) => {
      const pathAt = `${at} · chemin ${pi + 1} « ${p.label} »`
      const pathErrs: string[] = []
      if (!p.label.trim()) pathErrs.push('chemin sans libellé')
      if (p.label.length > SCRIPT_LIMITS.pathLabelMax) pathErrs.push(`libellé de chemin de ${p.label.length} caractères (max ${SCRIPT_LIMITS.pathLabelMax})`)
      if (!(PATH_COLORS as readonly string[]).includes(p.color)) pathErrs.push(`couleur « ${p.color} » inconnue`)
      if (p.messages.length === 0) pathErrs.push('chemin vide')
      push(pathAt, pathErrs)
      p.messages.forEach((m, mi) => push(`${pathAt} · message ${mi + 1} « ${m.title} »`, messageErrors(m, p.messages.length - mi - 1)))
    })
  })
  return errors
}

/**
 * Ajustements SÛRS avant la vérification, chacun noté pour le rapport — au plus près de l'intention
 * du script, là où le Studio ne peut pas la suivre :
 *  - un délai de relance sous le minimum est porté au minimum (le Notion de référence en contient :
 *    « +7 secondes après le précédent », KYC de Lucie, recette du 2026-10-06) ;
 *  - un prix non entier est arrondi à l'euro le plus proche (le Studio ne prend que des entiers).
 * Tout le reste est laissé à `validateScriptDraft`.
 */
export function normalizeDraft(d: ScriptDraft): { draft: ScriptDraft; notes: DraftError[] } {
  const notes: DraftError[] = []
  const round = (title: string, p: number): number => {
    if (Number.isInteger(p) || !Number.isFinite(p)) return p
    const r = Math.round(p)
    notes.push({ where: title, message: `prix ${euros(p)} arrondi à ${euros(r)} (MyPuls : euros entiers)` })
    return r
  }
  const fix = (m: DraftMessage): DraftMessage => {
    const before = notes.length
    const chainDelays = m.chainDelays.map((s) => {
      if (s >= SCRIPT_LIMITS.minChainDelay) return s
      notes.push({ where: m.title, message: `relance de ${s} s portée à ${SCRIPT_LIMITS.minChainDelay} s (minimum MyPuls)` })
      return SCRIPT_LIMITS.minChainDelay
    })
    const price = round(m.title, m.price)
    const pendingMedia = m.pendingMedia && { ...m.pendingMedia, price: round(m.title, m.pendingMedia.price) }
    return notes.length === before ? m : { ...m, chainDelays, price, pendingMedia }
  }
  const items = d.items.map((it): DraftItem =>
    it.type === 'message' ? fix(it) : { ...it, paths: it.paths.map((p) => ({ ...p, messages: p.messages.map(fix) })) },
  )
  return { draft: notes.length ? { ...d, items } : d, notes }
}

export function summarizeDraft(d: ScriptDraft): DraftSummary {
  const all = d.items.flatMap((it) => (it.type === 'message' ? [it] : it.paths.flatMap((p) => p.messages)))
  return {
    sequence: d.isSequence,
    messages: all.length,
    branches: d.items.filter((it) => it.type === 'branch').length,
    paid: all.filter((m) => m.price > 0 || (m.pendingMedia?.price ?? 0) > 0).length,
    pendingMedia: all.filter((m) => m.pendingMedia).length,
    totalPrice: all.reduce((s, m) => s + m.price + (m.pendingMedia?.price ?? 0), 0),
  }
}

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

export function parseScriptDraft(json: unknown): ScriptDraft {
  const o = obj(json, 'racine')
  if (typeof o.isSequence !== 'boolean') fail('isSequence')
  return {
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
}
