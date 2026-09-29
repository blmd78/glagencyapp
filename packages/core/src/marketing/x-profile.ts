/**
 * Relevé des profils X (Twitter) — les règles pures du job `marketing-x` (spec
 * docs/superpowers/specs/2026-09-28-comptes-x-design.md). Un profil X ne rend que les valeurs du
 * MOMENT : la courbe n'existe que parce qu'on relève chaque nuit.
 */

/** Les SEULS champs demandés à X — ceux que déclare l'app (console.x.com). */
export const X_USER_FIELDS = 'public_metrics,url,entities,most_recent_tweet_id,protected,verified_followers_count'

/** Plafond dur par run : X facture chaque compte rendu, le coût reste borné même si la table grossit. */
export const X_MAX_ACCOUNTS = 200

/** Sous-ensemble de l'objet User de l'API X v2 (champs de `X_USER_FIELDS`). */
export interface XUser {
  id: string
  username: string
  protected?: boolean
  url?: string
  most_recent_tweet_id?: string
  /** La doc X le décrit comme une chaîne. */
  verified_followers_count?: string | number
  public_metrics?: {
    followers_count?: number
    following_count?: number
    tweet_count?: number
    listed_count?: number
  }
  entities?: { url?: { urls?: { url?: string; expanded_url?: string }[] } }
}

/** Erreur partielle d'une recherche groupée : HTTP 200, tableau `errors` à côté de `data`. */
export interface XLookupError {
  value?: string
  resource_id?: string
  parameter?: string
  title?: string
  detail?: string
  type?: string
}

export interface XAccountRef {
  id: string
  handle: string
  xUserId: string | null
}

export interface XProfileSnapshot {
  xUserId: string
  username: string
  followers: number | null
  following: number | null
  verifiedFollowers: number | null
  postsTotal: number | null
  /** URL DÉPLOYÉE du lien de la bio (pas le t.co). */
  bioUrl: string | null
  /** Date du dernier tweet, ISO — déduite de son identifiant. */
  lastPostAt: string | null
  status: 'ok' | 'privé'
}

export type XAccountResult =
  | { accountId: string; kind: 'found'; snapshot: XProfileSnapshot }
  | { accountId: string; kind: 'missing'; status: 'suspendu' | 'introuvable' }

export interface XPrevSnapshot {
  followers: number | null
  postsTotal: number | null
}

/** Époque des identifiants Snowflake de X : 2010-11-04T01:42:54.657Z. */
const X_EPOCH_MS = 1288834974657n

/** Date de création d'un tweet : les bits au-dessus des 22 derniers = millisecondes depuis l'époque X. */
export function tweetDate(id: string): string | null {
  if (!/^\d+$/.test(id)) return null
  return new Date(Number((BigInt(id) >> 22n) + X_EPOCH_MS)).toISOString()
}

const count = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export function parseXUser(u: XUser): XProfileSnapshot {
  const m = u.public_metrics ?? {}
  const bio = u.entities?.url?.urls?.[0]
  return {
    xUserId: u.id,
    username: u.username,
    followers: count(m.followers_count),
    following: count(m.following_count),
    verifiedFollowers: count(u.verified_followers_count),
    postsTotal: count(m.tweet_count),
    bioUrl: bio?.expanded_url || bio?.url || u.url || null,
    lastPostAt: u.most_recent_tweet_id ? tweetDate(u.most_recent_tweet_id) : null,
    status: u.protected ? 'privé' : 'ok',
  }
}

/**
 * La doc X ne documente pas la forme exacte d'une suspension : on se fie au mot « suspend » du
 * titre ou du détail, et tout le reste est « introuvable ». À confirmer sur un vrai compte suspendu.
 */
export function xStatusFromError(e: XLookupError): 'suspendu' | 'introuvable' {
  return `${e.title ?? ''} ${e.detail ?? ''}`.toLowerCase().includes('suspend') ? 'suspendu' : 'introuvable'
}

/**
 * Rattache chaque compte à sa réponse : par IDENTIFIANT X s'il est connu (un compte renommé reste
 * le même compte), sinon par pseudo sans la casse. Un compte identifié ne se rattache jamais par
 * pseudo : un autre compte a pu reprendre son ancien nom.
 */
export function matchXLookup(
  accounts: readonly XAccountRef[],
  users: readonly XUser[],
  errors: readonly XLookupError[],
): XAccountResult[] {
  const byId = new Map(users.map((u) => [u.id, u]))
  const byName = new Map(users.map((u) => [u.username.toLowerCase(), u]))
  const errorOf = new Map(errors.map((e) => [String(e.value ?? e.resource_id ?? '').toLowerCase(), e]))
  return accounts.map((a) => {
    const key = (a.xUserId ?? a.handle).toLowerCase()
    const u = a.xUserId ? byId.get(a.xUserId) : byName.get(key)
    if (u) return { accountId: a.id, kind: 'found', snapshot: parseXUser(u) }
    const e = errorOf.get(key)
    return { accountId: a.id, kind: 'missing', status: e ? xStatusFromError(e) : 'introuvable' }
  })
}

/**
 * Variations contre le relevé précédent. Une perte d'abonnés reste négative ; des tweets
 * SUPPRIMÉS font baisser le total, mais « tweets publiés » ne descend pas sous zéro.
 */
export function xDeltas(
  s: XProfileSnapshot,
  prev: XPrevSnapshot | undefined,
): { deltaFollowers: number | null; posts24h: number | null } {
  return {
    deltaFollowers: s.followers != null && prev?.followers != null ? s.followers - prev.followers : null,
    posts24h: s.postsTotal != null && prev?.postsTotal != null ? Math.max(0, s.postsTotal - prev.postsTotal) : null,
  }
}

/** Un pseudo X valide : 1 à 15 caractères parmi lettres, chiffres et « _ ». */
export function isValidXHandle(handle: string): boolean {
  return /^[A-Za-z0-9_]{1,15}$/.test(handle)
}

/**
 * Ce que le marketing colle dans « Ajouter des comptes » → le pseudo X, ou `null`. Accepte
 * `@pseudo` et un lien de profil x.com / twitter.com (le reste du chemin est ignoré) ; tout le
 * reste doit déjà être un pseudo valide — on ne devine pas.
 */
export function normalizeXHandle(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
  return isValidXHandle(s) ? s : null
}

/**
 * Une liste collée (un pseudo par ligne ; virgules et espaces acceptés aussi) → les pseudos
 * valides, dédoublonnés sans la casse (la première écriture gagne), et les entrées refusées
 * telles que saisies, pour les montrer à qui les a tapées.
 */
export function parseXHandleList(text: string): { handles: string[]; invalid: string[] } {
  const handles: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const entry of text.split(/[\s,;]+/)) {
    if (!entry) continue
    const h = normalizeXHandle(entry)
    if (!h) invalid.push(entry)
    else if (!seen.has(h.toLowerCase())) {
      seen.add(h.toLowerCase())
      handles.push(h)
    }
  }
  return { handles, invalid }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function capXAccounts<T>(items: readonly T[], max: number): { kept: T[]; dropped: T[] } {
  return { kept: items.slice(0, max), dropped: items.slice(max) }
}
