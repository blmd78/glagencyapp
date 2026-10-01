/**
 * Trafic LinkScale — règles pures du job `marketing-linkscale` et de la page Marketing › Trafic
 * (spec docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md). LinkScale compte par LIEN :
 * le profil et la modèle se DÉDUISENT de la note et du dossier, tapés à la main par l'équipe
 * (`TW ARA CARLA`, `IN JULIETARDIFF`, dossier « CARLA »). Rien n'est inventé : ce qui ne se
 * reconnaît pas reste non attribué, et se corrige sur la page.
 */

export const LS_PLATFORMS = ['x', 'instagram', 'threads', 'snapchat', 'autre'] as const
export type LsPlatform = (typeof LS_PLATFORMS)[number]
export const LS_PLATFORM_LABEL: Record<LsPlatform, string> = {
  x: 'X',
  instagram: 'Instagram',
  threads: 'Threads',
  snapchat: 'Snapchat',
  autre: 'Autre',
}

/** `landing` = page à boutons (l_p), `redirect` = redirection directe (d_l). */
export type LsKind = 'landing' | 'redirect' | 'shortcut' | 'inconnu'

export function kindOf(t: string | null | undefined): LsKind {
  if (t === 'l_p') return 'landing'
  if (t === 'd_l') return 'redirect'
  if (t === 'shortcut') return 'shortcut'
  return 'inconnu'
}

/** Une redirection n'a pas de bouton : la visite EST le passage vers la destination, rien à compter. */
export const mymClicksOf = (kind: LsKind, clicks: number): number | null => (kind === 'redirect' ? null : clicks)

/** Une ligne de `trafficByUrls` (GET /api/v1/stats) — seuls les champs lus. */
export interface LsTrafficRow {
  id: string
  host?: string
  u?: string
  url?: string
  note?: string | null
  human_users?: number
  bots?: number
  button_clicks?: { url?: string | null; clicks?: number }[] | null
}

export interface LsDayLine {
  lsId: string
  url: string
  note: string
  visitors: number
  bots: number
  /** Clics de boutons vers mym.fans (0 si aucun). */
  mymClicks: number
}

const isMym = (url: string | null | undefined) => typeof url === 'string' && url.includes('mym.fans')

/**
 * Une journée de stats → une ligne par lien. LinkScale rend une ligne par URL : un lien renommé
 * dans la journée (`elsaaa` → `elssa`) arrive en DEUX lignes de même id, fusionnées ici (sinon
 * l'upsert `(link_id, date)` toucherait deux fois la même ligne). Lève une erreur si la forme n'est
 * pas celle attendue.
 */
export function parseLinkscaleDay(payload: unknown): LsDayLine[] {
  const rows = (payload as { trafficByUrls?: unknown } | null)?.trafficByUrls
  if (!Array.isArray(rows)) throw new Error('payload LinkScale inattendu (trafficByUrls absent)')
  const byId = new Map<string, LsDayLine>()
  for (const r of rows as LsTrafficRow[]) {
    if (typeof r?.id !== 'string' || r.id === '') continue
    const mymClicks = (r.button_clicks ?? []).reduce((s, b) => s + (isMym(b?.url) ? (b.clicks ?? 0) : 0), 0)
    const seen = byId.get(r.id)
    if (seen) {
      seen.visitors += r.human_users ?? 0
      seen.bots += r.bots ?? 0
      seen.mymClicks += mymClicks
      if (!seen.note) seen.note = (r.note ?? '').trim()
      continue
    }
    byId.set(r.id, {
      lsId: r.id,
      url: r.url ?? [r.host, r.u].filter(Boolean).join('/'),
      note: (r.note ?? '').trim(),
      visitors: r.human_users ?? 0,
      bots: r.bots ?? 0,
      mymClicks,
    })
  }
  return [...byId.values()]
}

/** Un lien de GET /api/v1/links — seuls les champs lus. `url` = destination (d_l, shortcut). */
export interface LsListedLink {
  _id: string
  t?: string
  domain?: string
  u?: string
  url?: string
  note?: string
  folders?: string[] | null
}

export interface LsCreatorRef {
  id: string
  name: string
}

/** Un compte INSTAGRAM du CRM (`mkt_social_accounts`). */
export interface LsAccountRef {
  id: string
  handle: string
  creatorId: string | null
}

export interface LsLinkFacts {
  note: string
  folderNames: string[]
  destination: string | null
}

export interface LsAttribution {
  creatorId: string | null
  platform: LsPlatform
  socialAccountId: string | null
  operator: string | null
}

const folded = new Map<string, string>()

/**
 * Minuscules, sans accents ni rien d'autre que lettres et chiffres : « Carla.Jadot » → « carlajadot ».
 * Mémoïsé : le relevé replie les mêmes noms de modèles et pseudos pour chacun des ~300 liens, sous
 * le budget CPU de 10 ms d'une invocation Worker Free.
 */
export function foldName(s: string): string {
  let f = folded.get(s)
  if (f === undefined) {
    f = s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    folded.set(s, f)
  }
  return f
}

// `threads` avant `tw` et `in`. Le préfixe peut être collé (`TWJADE`, `INLenaMonerro`) : une note
// qui commencerait par « In… » sans être Instagram serait mal lue — aucun cas dans les données
// du 2026-09-30, et la correction manuelle rattrape.
const PREFIX = /^(threads|tw|in)(.*)$/i

export function splitNote(note: string): { prefix: 'x' | 'instagram' | 'threads' | null; rest: string } {
  const clean = note.replace(/\[[^\]]*\]/g, '').trim()
  const m = PREFIX.exec(clean)
  if (!m) return { prefix: null, rest: clean }
  const p = m[1]!.toLowerCase()
  return { prefix: p === 'tw' ? 'x' : p === 'in' ? 'instagram' : 'threads', rest: m[2]!.trim() }
}

/** En dessous, un début de pseudo (« carla ») désigne trop de comptes pour valoir un compte. */
const MIN_PREFIX = 6

/** Le compte Instagram de la note : pseudo identique, sinon UN SEUL pseudo qui prolonge (« Julietardifff »). */
function findAccount(rest: string, accounts: LsAccountRef[]): LsAccountRef | null {
  const f = foldName(rest)
  if (!f) return null
  const exact = accounts.filter((a) => foldName(a.handle) === f)
  if (exact.length === 1) return exact[0]!
  if (exact.length > 1 || f.length < MIN_PREFIX) return null
  const near = accounts.filter((a) => {
    const h = foldName(a.handle)
    return h.length >= MIN_PREFIX && (h.startsWith(f) || f.startsWith(h))
  })
  return near.length === 1 ? near[0]! : null
}

/**
 * Modèle, réseau, compte, opérateur d'un lien. Modèle, dans l'ordre : le dossier au nom EXACT
 * d'une modèle (« CARLA » → Carla, jamais « Carla (privé) ») ; la modèle du compte Instagram ; le
 * prénom APRÈS l'opérateur (`TW RORO LENA`) ; une note réduite à un prénom (`Lucie`). `TW JADE`
 * désigne l'opérateur JADE : le premier mot après `TW` n'est jamais lu comme une modèle.
 */
export function attributeLink(
  link: LsLinkFacts,
  refs: { creators: LsCreatorRef[]; accounts: LsAccountRef[] },
): LsAttribution {
  const { prefix, rest } = splitNote(link.note)
  const platform: LsPlatform = prefix ?? (link.destination?.includes('snapchat.com') ? 'snapchat' : 'autre')
  const creatorByName = (name: string): string | null => {
    const f = foldName(name)
    return f ? (refs.creators.find((c) => foldName(c.name) === f)?.id ?? null) : null
  }
  const words = rest.split(/\s+/).filter(Boolean)
  const operator = platform === 'x' && words[0] ? foldName(words[0]).toUpperCase() || null : null
  const account = platform === 'instagram' ? findAccount(rest, refs.accounts) : null

  let creatorId: string | null = null
  for (const folder of link.folderNames) {
    creatorId = creatorByName(folder)
    if (creatorId) break
  }
  if (!creatorId && account) creatorId = account.creatorId
  if (!creatorId && platform === 'x' && words[1]) creatorId = creatorByName(words[1])
  if (!creatorId && !prefix) creatorId = creatorByName(rest)
  return { creatorId, platform, socialAccountId: account?.id ?? null, operator }
}

/** Un lien déjà en base (`mkt_ls_links`) — ce que le plan doit préserver. */
export interface LsKnownLink {
  lsId: string
  manual: boolean
  creatorId: string | null
  platform: string
  socialAccountId: string | null
  operator: string | null
  firstSeen: string | null
  lastSeen: string | null
  /** Faits déjà connus : ils survivent à la disparition du lien de la liste LinkScale. */
  url: string
  note: string
  folders: string[]
  kind: LsKind
  destination: string | null
}

/** Une ligne `mkt_ls_links` à upserter (colonnes de 0179, sauf `id`). */
export interface LsLinkWrite {
  ls_id: string
  url: string
  note: string
  folders: string[]
  kind: LsKind
  destination: string | null
  creator_id: string | null
  platform: string
  social_account_id: string | null
  operator: string | null
  manual: boolean
  first_seen: string | null
  last_seen: string | null
}

/** Une ligne `mkt_ls_daily`, encore indexée par l'id LinkScale (le job la traduit en uuid). */
export interface LsDailyWrite {
  lsId: string
  date: string
  visitors: number
  bots: number
  mym_clicks: number | null
}

export interface LsPlanInput {
  days: { date: string; lines: LsDayLine[] }[]
  listed: LsListedLink[]
  /** id de dossier LinkScale → nom. */
  folderNames: Record<string, string>
  known: LsKnownLink[]
  creators: LsCreatorRef[]
  accounts: LsAccountRef[]
}

/**
 * Ce que le relevé écrit. Un lien = ceux de la LISTE + ceux vus dans les STATS. Un lien absent de
 * la liste (supprimé côté LinkScale) garde ce qu'on savait de lui — note, dossiers, type,
 * destination, donc son attribution ; jamais vu avant, il entre en `kind = 'inconnu'`. Un lien
 * `manual` garde son attribution.
 */
export function planLinkscaleWrite(input: LsPlanInput): { links: LsLinkWrite[]; daily: LsDailyWrite[] } {
  const listed = new Map(input.listed.map((l) => [l._id, l]))
  const known = new Map(input.known.map((k) => [k.lsId, k]))
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date))
  const seen = new Map<string, { note: string; url: string; first: string; last: string }>()
  for (const { date, lines } of days) {
    for (const line of lines) {
      const s = seen.get(line.lsId)
      seen.set(line.lsId, {
        note: line.note || s?.note || '',
        url: line.url || s?.url || '',
        first: s?.first ?? date,
        last: date,
      })
    }
  }

  const links: LsLinkWrite[] = []
  for (const lsId of new Set([...listed.keys(), ...seen.keys()])) {
    const l = listed.get(lsId)
    const s = seen.get(lsId)
    const k = known.get(lsId)
    const note = (s?.note || l?.note || k?.note || '').trim()
    const folders = l ? (l.folders ?? []).map((id) => input.folderNames[id] ?? id) : (k?.folders ?? [])
    const destination = l ? (l.url ?? null) : (k?.destination ?? null)
    const kind: LsKind = l ? kindOf(l.t) : (k?.kind ?? 'inconnu')
    const attr: LsAttribution = k?.manual
      ? {
          creatorId: k.creatorId,
          platform: k.platform as LsPlatform,
          socialAccountId: k.socialAccountId,
          operator: k.operator,
        }
      : attributeLink({ note, folderNames: folders, destination }, input)
    const dates = [k?.firstSeen, k?.lastSeen, s?.first, s?.last].filter((d): d is string => !!d).sort()
    links.push({
      ls_id: lsId,
      // L'URL actuelle (liste) d'abord : un lien renommé garde sinon l'ancien slug des stats.
      url: (l ? [l.domain, l.u].filter(Boolean).join('/') : '') || s?.url || k?.url || '',
      note,
      folders,
      kind,
      destination,
      creator_id: attr.creatorId,
      platform: attr.platform,
      social_account_id: attr.socialAccountId,
      operator: attr.operator,
      manual: k?.manual ?? false,
      first_seen: dates[0] ?? null,
      last_seen: dates.at(-1) ?? null,
    })
  }

  const kind = new Map(links.map((l) => [l.ls_id, l.kind]))
  const daily = days.flatMap(({ date, lines }) =>
    lines.map((line) => ({
      lsId: line.lsId,
      date,
      visitors: line.visitors,
      bots: line.bots,
      mym_clicks: mymClicksOf(kind.get(line.lsId) ?? 'inconnu', line.mymClicks),
    })),
  )
  return { links, daily }
}
