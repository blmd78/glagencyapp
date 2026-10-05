import {
  labelIndex,
  UNDETERMINED_LABEL,
  type IdentityDirectoryEntry,
  type IdentityIssue,
} from './identity-types'

/**
 * RATTRAPAGE d'identité (spec § 5) : un RAPPORT (lecture seule) qui classe les fiches, et la
 * DOUBLE PREUVE exigée de chaque groupe d'un lot validé par Benoit avant toute fusion — même id
 * MyPuls ET compensation au centime jour par jour, aucun jour en commun. La CLI
 * `identity-backfill` lit, écrit le rapport et n'applique qu'un lot ; ici, rien que la décision.
 */

export interface BackfillFiche {
  id: string
  displayName: string
  email: string | null
  mypulsUserId: string | null
  /** Reliée à un membre (`profiles.chatter_id`) : c'est elle que la paie lit. */
  linked: boolean
  /** Σ CA (chatter_daily + chatter_creator_daily), €, pour départager deux fiches sans membre. */
  activity: number
  aliases: string[]
}

export interface BackfillPlan {
  /** Fiches qu'un seul compte désigne (information : l'ingestion posera l'id elle-même). */
  links: { chatterId: string; mypulsUserId: string }[]
  /** Fusions CANDIDATES (cible D10) — appliquées seulement si listées dans un lot validé. */
  merges: { keep: string; old: string; mypulsUserId: string }[]
  issues: IdentityIssue[]
  corrupted: string[]
}

/** Les 26 fiches du 2026-09-07 : libellé de la table de classement lu comme une vente. */
const CORRUPTED = /Aucune vente sur la période|\n/

export function planIdentityBackfill(input: {
  fiches: BackfillFiche[]
  directory: IdentityDirectoryEntry[]
  norm: (s: string) => string
}): BackfillPlan {
  const idx = labelIndex(input.directory, input.norm)
  const plan: BackfillPlan = { links: [], merges: [], issues: [], corrupted: [] }
  const groups = new Map<string, BackfillFiche[]>()

  for (const f of input.fiches) {
    if (CORRUPTED.test(f.displayName)) {
      plan.corrupted.push(f.id)
      continue
    }
    if (UNDETERMINED_LABEL.test(f.displayName)) continue

    const votes = new Set<string>()
    for (const l of [f.displayName, ...f.aliases, ...(f.email ? [f.email] : [])]) {
      for (const id of idx.idsOf(l)) votes.add(id)
    }
    if (votes.size > 1) {
      const list = [...votes].sort()
      plan.issues.push({
        issueKey: `homonyme:${f.id}`,
        kind: 'homonyme',
        mypulsUserId: f.mypulsUserId,
        label: f.displayName,
        chatterId: f.id,
        otherChatterId: null,
        day: null,
        amount: null,
        detail: `La fiche « ${f.displayName} » correspond à ${list.length} comptes MyPuls (${list.join(', ')}) : son historique mélange plusieurs personnes et n'est pas découpé.`,
      })
      continue
    }
    const vote = [...votes][0]
    if (f.mypulsUserId && vote && vote !== f.mypulsUserId) {
      plan.issues.push({
        issueKey: `conflit:${f.id}`,
        kind: 'conflit_id',
        mypulsUserId: f.mypulsUserId,
        label: f.displayName,
        chatterId: f.id,
        otherChatterId: null,
        day: null,
        amount: null,
        detail: `La fiche « ${f.displayName} » porte l'id MyPuls ${f.mypulsUserId}, mais son libellé désigne le compte ${vote}.`,
      })
      continue
    }
    const id = f.mypulsUserId ?? vote
    if (!id) continue
    const g = groups.get(id) ?? []
    g.push(f)
    groups.set(id, g)
  }

  for (const [id, g] of groups) {
    if (g.length === 1) {
      const f = g[0]!
      if (!f.mypulsUserId) plan.links.push({ chatterId: f.id, mypulsUserId: id })
      continue
    }
    const linked = g.filter((f) => f.linked)
    if (linked.length > 1) {
      plan.issues.push({
        issueKey: `membres:${id}`,
        kind: 'membres_multiples',
        mypulsUserId: id,
        label: linked[0]!.displayName,
        chatterId: linked[0]!.id,
        otherChatterId: linked[1]!.id,
        day: null,
        amount: null,
        detail: `L'id MyPuls ${id} correspond à ${linked.length} fiches reliées chacune à un membre (${linked.map((f) => `« ${f.displayName} »`).join(', ')}) : à trancher à la main.`,
      })
      continue
    }
    // Cible (décision Benoit 2026-10-01) : la fiche payée, sinon celle qui porte déjà l'id, sinon la plus active.
    const keep =
      linked[0] ??
      g.find((f) => f.mypulsUserId === id) ??
      [...g].sort((a, b) => b.activity - a.activity || a.id.localeCompare(b.id))[0]!
    for (const f of g) if (f !== keep) plan.merges.push({ keep: keep.id, old: f.id, mypulsUserId: id })
  }
  return plan
}

/**
 * Ids MyPuls de chaque fiche : celui qu'elle porte ∪ ceux que ses libellés désignent. Une
 * pseudo-fiche « Indéterminé (<modèle>) » n'a JAMAIS d'id (ensemble vide) : la double preuve la
 * refuse donc, qu'elle soit gardée ou à vider — même si l'annuaire porte son libellé.
 */
export function ficheIds(input: {
  fiches: BackfillFiche[]
  directory: IdentityDirectoryEntry[]
  norm: (s: string) => string
}): Map<string, Set<string>> {
  const idx = labelIndex(input.directory, input.norm)
  const out = new Map<string, Set<string>>()
  for (const f of input.fiches) {
    if (UNDETERMINED_LABEL.test(f.displayName)) {
      out.set(f.id, new Set())
      continue
    }
    const s = new Set<string>()
    if (f.mypulsUserId) s.add(f.mypulsUserId)
    for (const l of [f.displayName, ...f.aliases, ...(f.email ? [f.email] : [])]) for (const id of idx.idsOf(l)) s.add(id)
    out.set(f.id, s)
  }
  return out
}

/**
 * Faits d'une fiche, en centimes : résumé par jour (`cd`, clé = jour) et ventes par jour (`ccd`,
 * clé = jour, somme de tous les modèles). `ccdKeys` liste les lignes de chatter_creator_daily,
 * clés `modèle|jour` : c'est elle qui détecte un (modèle, jour) en commun.
 */
export interface FicheFacts {
  cd: ReadonlyMap<string, number>
  ccd: ReadonlyMap<string, number>
  ccdKeys: ReadonlySet<string>
}
export const NO_FACTS: FicheFacts = { cd: new Map(), ccd: new Map(), ccdKeys: new Set() }

export interface GroupProof {
  ok: boolean
  mypulsUserId: string | null
  reasons: string[]
  /** Jours où une fiche à vider a des chiffres — ceux sur lesquels la compensation est vérifiée. */
  daysChecked: number
}

/**
 * DOUBLE PREUVE d'un groupe « une fiche gardée + des fiches à vider » (D13) :
 * 1. même id MyPuls — chaque fiche a un ensemble d'ids non vide, l'union vaut UN id (et l'id
 *    attendu du lot, s'il est donné) ;
 * 2. aucun jour en commun — chatter_daily (jour) et chatter_creator_daily (modèle, jour) ;
 * 3. compensation au centime — chaque jour où une fiche à vider a des chiffres, Σ résumé du
 *    groupe = Σ ventes du groupe (le cas Lionel : le résumé sur une fiche, les ventes sur l'autre).
 * Prouvé en GROUPE : avec trois fiches, une paire seule peut ne pas compenser.
 */
export function proveGroup(input: {
  keep: { facts: FicheFacts; ids: ReadonlySet<string> }
  olds: { facts: FicheFacts; ids: ReadonlySet<string> }[]
  expectedId?: string | null
}): GroupProof {
  const reasons = new Set<string>()
  const all = [input.keep, ...input.olds]

  let mypulsUserId: string | null = null
  if (all.some((f) => f.ids.size === 0)) reasons.add('id MyPuls non établi pour au moins une fiche du groupe')
  else {
    const union = new Set(all.flatMap((f) => [...f.ids]))
    if (union.size !== 1) reasons.add(`ids MyPuls différents (${[...union].sort().join(', ')})`)
    else mypulsUserId = [...union][0]!
  }
  if (mypulsUserId && input.expectedId && input.expectedId !== mypulsUserId) {
    reasons.add(`id attendu ${input.expectedId}, id prouvé ${mypulsUserId}`)
  }

  input.olds.forEach((o, i) => {
    const others = all.filter((_, j) => j !== i + 1)
    const cd = [...o.facts.cd.keys()].filter((d) => others.some((x) => x.facts.cd.has(d))).sort()
    const ccd = [...o.facts.ccdKeys].filter((k) => others.some((x) => x.facts.ccdKeys.has(k)))
    if (cd.length) reasons.add(`${cd.length} jour(s) en commun dans chatter_daily (${cd.slice(0, 3).join(', ')})`)
    if (ccd.length) reasons.add(`${ccd.length} (modèle, jour) en commun dans chatter_creator_daily`)
  })

  const days = [...new Set(input.olds.flatMap((o) => [...o.facts.cd.keys(), ...o.facts.ccd.keys()]))].sort()
  const total = (m: 'cd' | 'ccd', d: string) => all.reduce((s, f) => s + (f.facts[m].get(d) ?? 0), 0)
  const off = days.filter((d) => total('cd', d) !== total('ccd', d))
  if (off.length) reasons.add(`${off.length} jour(s) non compensé(s) au centime (${off.slice(0, 3).join(', ')})`)

  return { ok: reasons.size === 0, mypulsUserId, reasons: [...reasons], daysChecked: days.length }
}

/** Une ligne d'un lot validé (`apps/ingestion/identity-lots/lot-N.csv`). */
export interface LotLine {
  line: number
  action: 'fusionner' | 'supprimer'
  slug: string
  keep: string | null
  old: string
  expectedId: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lit un lot CSV `action,slug,garder,vider,id_attendu` (lignes `#` ignorées). Lève sur toute ligne invalide. */
export function parseLot(csv: string): LotLine[] {
  const out: LotLine[] = []
  const videes = new Set<string>()
  csv.split('\n').forEach((raw, i) => {
    const line = i + 1
    const s = raw.trim()
    if (!s || s.startsWith('#') || s.startsWith('action,')) return
    const cols = s.split(',').map((x) => x.trim())
    if (cols.length !== 5) {
      throw new Error(`lot ligne ${line} : ${cols.length} colonnes au lieu de 5 (action,slug,garder,vider,id_attendu)`)
    }
    // UUID en minuscules : égalité et doublons insensibles à la casse, comme la validation.
    const [action = '', slug = '', garderBrut = '', viderBrut = '', id = ''] = cols
    const garder = garderBrut.toLowerCase()
    const vider = viderBrut.toLowerCase()
    if (action !== 'fusionner' && action !== 'supprimer') throw new Error(`lot ligne ${line} : action « ${action} » inconnue`)
    if (!UUID.test(vider)) throw new Error(`lot ligne ${line} : fiche à vider invalide (« ${vider} »)`)
    if (action === 'fusionner' && !UUID.test(garder)) throw new Error(`lot ligne ${line} : fiche gardée invalide (« ${garder} »)`)
    if (action === 'supprimer' && garder) throw new Error(`lot ligne ${line} : « supprimer » ne prend pas de fiche gardée`)
    if (garder === vider) throw new Error(`lot ligne ${line} : fiche gardée = fiche vidée`)
    if (id && !/^[1-9]\d*$/.test(id)) throw new Error(`lot ligne ${line} : id attendu invalide (« ${id} »)`)
    if (videes.has(vider)) throw new Error(`lot ligne ${line} : fiche ${vider} déjà vidée plus haut`)
    videes.add(vider)
    out.push({ line, action, slug, keep: action === 'fusionner' ? garder : null, old: vider, expectedId: id || null })
  })
  for (const l of out) {
    if (l.keep && videes.has(l.keep)) throw new Error(`lot ligne ${l.line} : la fiche gardée ${l.keep} est vidée ailleurs dans le lot`)
  }
  return out
}

const hasFacts = (f: FicheFacts): boolean => f.cd.size > 0 || f.ccdKeys.size > 0

export interface LotDecision {
  lines: LotLine[]
  ok: boolean
  mypulsUserId: string | null
  reasons: string[]
}

/**
 * Décision par groupe d'un lot : les lignes `fusionner` qui partagent une fiche gardée forment UN
 * groupe, prouvé par `proveGroup` ; une ligne `supprimer` n'est acceptée que pour une fiche que le
 * rapport classe « corrompue » ET qui n'a aucun chiffre (spec § 6). Une fiche à vider reliée à un membre est refusée, qu'on la fusionne
 * ou qu'on la supprime. Deux `id_attendu` différents dans un même groupe le font refuser.
 */
export function proveLot(input: {
  lines: LotLine[]
  facts: ReadonlyMap<string, FicheFacts>
  ids: ReadonlyMap<string, ReadonlySet<string>>
  linked: ReadonlySet<string>
  corrupted: ReadonlySet<string>
}): LotDecision[] {
  const out: LotDecision[] = []
  const groups = new Map<string, LotLine[]>()
  for (const l of input.lines) {
    if (l.action === 'supprimer') {
      const reasons: string[] = []
      if (!input.facts.has(l.old)) reasons.push('fiche inconnue')
      else if (input.linked.has(l.old)) reasons.push('fiche reliée à un membre : suppression refusée')
      else if (!input.corrupted.has(l.old)) reasons.push("la fiche n'est pas classée « corrompue » par le rapport")
      else if (hasFacts(input.facts.get(l.old)!)) reasons.push('la fiche a des chiffres : suppression refusée')
      out.push({ lines: [l], ok: reasons.length === 0, mypulsUserId: null, reasons })
      continue
    }
    const g = groups.get(l.keep!) ?? []
    g.push(l)
    groups.set(l.keep!, g)
  }
  for (const [keep, lines] of groups) {
    const reasons: string[] = []
    const unknown = [keep, ...lines.map((l) => l.old)].filter((id) => !input.facts.has(id))
    if (unknown.length) reasons.push(`fiche(s) inconnue(s) : ${unknown.join(', ')}`)
    const linkedOld = lines.filter((l) => input.linked.has(l.old)).map((l) => l.slug)
    if (linkedOld.length) reasons.push(`fiche à vider reliée à un membre : ${linkedOld.join(', ')}`)
    // Un seul id attendu par groupe : deux lignes qui en annoncent deux différents se contredisent.
    const expected = [...new Set(lines.map((l) => l.expectedId).filter((x): x is string => x !== null))]
    if (expected.length > 1) reasons.push(`id_attendu contradictoires : ${expected.join(' / ')}`)
    let mypulsUserId: string | null = null
    if (!unknown.length) {
      const proof = proveGroup({
        keep: { facts: input.facts.get(keep)!, ids: input.ids.get(keep) ?? new Set() },
        olds: lines.map((l) => ({ facts: input.facts.get(l.old)!, ids: input.ids.get(l.old) ?? new Set() })),
        expectedId: expected.length === 1 ? expected[0]! : null,
      })
      reasons.push(...proof.reasons)
      mypulsUserId = proof.mypulsUserId
    }
    out.push({ lines, ok: reasons.length === 0, mypulsUserId, reasons })
  }
  return out
}
