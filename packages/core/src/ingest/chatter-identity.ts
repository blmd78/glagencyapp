import {
  doublonKey,
  ecartKey,
  ficheCreeeKey,
  ficheLibelleKey,
  homonymeKey,
  labelIndex,
  membresKey,
  resumeKey,
  UNDETERMINED_LABEL,
  type IdentityDirectoryEntry,
  type IdentityIssue,
} from './identity-types'

/**
 * Identité chatteur d'UNE journée money-team : à quelle fiche `chatters` va chaque ligne.
 * Spec : docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md § 2.
 *
 * - Une VENTE porte l'id MyPuls de son compte : c'est lui qui décide.
 * - Une ligne de RÉSUMÉ n'a pas d'id : on le déduit de l'annuaire du jour (exact, puis normalisé),
 *   et un libellé ambigu se départage par l'invariant « CA du résumé = Σ ventes du même id ».
 * - L'alias (libellé → fiche) n'est plus qu'un repli : ligne sans id, ou jour sans aucun id.
 * - Un libellé « Indéterminé (…) » ne donne JAMAIS d'id ni de lien : sa pseudo-fiche agrège tout
 *   un modèle (décision Benoit 2026-10-01). Un id lu sur une telle vente est ignoré et signalé.
 * - Jamais de lien durable deviné : une fiche sans id désignée ce jour par plusieurs comptes
 *   (libellé à plusieurs ids, ou plusieurs ids qui y mènent) n'est pas reliée → anomalie `homonyme`.
 *
 * Le résultat ne dépend pas de l'ordre des lignes pour tout ce qui touche aux ids : ids et
 * libellés sont traités triés, et les fiches que désigne chaque id sont relevées sur l'état EN BASE
 * avant toute décision. (Le chemin historique des lignes sans id, lui, suit l'ordre des lignes.)
 *
 * Pure : la normalisation (`normLabel`) et la fabrique d'uuid sont injectées. `summaryIds` et
 * `noIds` servent aux contrôles du jour (`day-checks.ts`).
 */

export interface SummaryLine {
  label: string
  ca: number
}

export interface SaleLine {
  label: string
  mypulsUserId: string | null
  amount: number
}

export interface IdentityState {
  chatterByMypulsId: ReadonlyMap<string, string>
  mypulsIdByChatter: ReadonlyMap<string, string | null>
  aliasOf: (norm: string) => string | undefined
  byName: (raw: string) => string | undefined
  byEmail: (norm: string) => string | undefined
  /** Fiches reliées à un membre (`profiles.chatter_id`) : celles que la paie lit. */
  linkedChatters: ReadonlySet<string>
}

export interface DayIdentity {
  summaryChatter: (string | null)[]
  /** Id MyPuls déduit de chaque ligne de résumé (null : aucun, ou mis de côté). */
  summaryIds: (string | null)[]
  saleChatter: (string | null)[]
  newChatters: { id: string; displayName: string; mypulsUserId: string | null }[]
  newAliases: { chatterId: string; rawLabel: string; rawLabelNorm: string }[]
  links: { chatterId: string; mypulsUserId: string }[]
  issues: IdentityIssue[]
  /** Alertes techniques (markup MyPuls) : Sentry, pas d'anomalie en base. */
  technical: string[]
  /** Jour sans aucun id lu (bouton « Éditer » disparu ?) : identité résolue par libellé seulement. */
  noIds: boolean
}

const cents = (n: number): number => Math.round(n * 100)
const eur = (c: number): string => (c / 100).toFixed(2).replace('.', ',')
/** Ordre des ids MyPuls (entiers > 0 en texte) : numérique, déterministe pour tout autre texte. */
const byMypulsId = (a: string, b: string): number => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)

export function resolveDayIdentity(input: {
  day: string
  summary: SummaryLine[]
  sales: SaleLine[]
  directory: IdentityDirectoryEntry[]
  state: IdentityState
  norm: (s: string) => string
  newId: () => string
}): DayIdentity {
  const { day, summary, state, norm, newId } = input
  const undetermined = (label: string): boolean => UNDETERMINED_LABEL.test(label)
  // Id lu sur une vente « Indéterminé (…) » : anomalie de markup, la ligne suit le chemin historique.
  const bogus = [...new Set(input.sales.filter((s) => s.mypulsUserId && undetermined(s.label)).map((s) => s.label))].sort()
  const sales = input.sales.map((s) => (s.mypulsUserId && undetermined(s.label) ? { ...s, mypulsUserId: null } : s))
  const out: DayIdentity = {
    summaryChatter: [],
    summaryIds: [],
    saleChatter: [],
    newChatters: [],
    newAliases: [],
    links: [],
    issues: [],
    technical: [],
    noIds: false,
  }
  const issueKeys = new Set<string>()
  const issue = (i: IdentityIssue): void => {
    if (issueKeys.has(i.issueKey)) return
    issueKeys.add(i.issueKey)
    out.issues.push(i)
  }

  // ── Chemin historique : libellé → fiche (alias → nom → e-mail), sinon nouvelle fiche ───────
  const aliasToday = new Map<string, string>()
  const aliasOf = (n: string): string | undefined => aliasToday.get(n) ?? state.aliasOf(n)
  const byLabel = (raw: string): string | undefined => {
    const n = norm(raw)
    return aliasOf(n) ?? state.byName(raw) ?? state.byEmail(n)
  }
  /** Jamais d'alias pour un libellé qui désigne déjà une AUTRE fiche, même par son seul nom. */
  const addAlias = (chatterId: string, raw: string): void => {
    const n = norm(raw)
    if (!n || aliasOf(n) !== undefined) return
    const known = byLabel(raw)
    if (known !== undefined && known !== chatterId) return
    aliasToday.set(n, chatterId)
    out.newAliases.push({ chatterId, rawLabel: raw, rawLabelNorm: n })
  }
  const createdByLabel = new Map<string, string>()
  const byLabelOrCreate = (raw: string): string => {
    const known = byLabel(raw) ?? createdByLabel.get(raw)
    if (known) {
      addAlias(known, raw)
      return known
    }
    const id = newId()
    createdByLabel.set(raw, id)
    out.newChatters.push({ id, displayName: raw, mypulsUserId: null })
    addAlias(id, raw)
    issue({
      issueKey: ficheLibelleKey(norm(raw)),
      kind: 'fiche_creee',
      mypulsUserId: null,
      label: raw,
      chatterId: id,
      otherChatterId: null,
      day,
      amount: null,
      detail: `Fiche créée pour le libellé « ${raw} », sans id MyPuls : à vérifier.`,
    })
    return id
  }

  // ── Jour sans aucun id : repli intégral sur les libellés ─────────────────────────────────────
  const noIds =
    sales.length > 0 &&
    sales.every((s) => s.mypulsUserId === null) &&
    sales.some((s) => !undetermined(s.label))
  out.noIds = noIds
  if (noIds) {
    out.technical.push(
      `${day} : aucun id MyPuls lu sur ${sales.length} vente(s) — bouton « Éditer » absent ou markup changé ; repli sur les libellés.`,
    )
  } else {
    const odd = [
      ...new Set(sales.filter((s) => s.mypulsUserId === null && s.label && !undetermined(s.label)).map((s) => s.label)),
    ].sort()
    if (odd.length) out.technical.push(`${day} : vente(s) sans id MyPuls hors « Indéterminé (…) » — ${odd.join(', ')}`)
  }
  if (bogus.length) {
    out.technical.push(`${day} : id MyPuls ignoré sur vente(s) « Indéterminé (…) », jamais d'id — ${bogus.join(', ')}`)
  }

  // ── Annuaire du jour (page + ventes) et ventes par id, en centimes ───────────────────────────
  const idx = labelIndex(
    [
      ...input.directory.filter((e) => !undetermined(e.label)),
      ...sales.flatMap((s) => (s.mypulsUserId ? [{ mypulsUserId: s.mypulsUserId, label: s.label }] : [])),
    ],
    norm,
  )
  const salesCents = new Map<string, number>()
  for (const s of sales) {
    if (s.mypulsUserId) salesCents.set(s.mypulsUserId, (salesCents.get(s.mypulsUserId) ?? 0) + cents(s.amount))
  }

  // ── Id de chaque ligne de résumé (annuaire), puis départage par le montant ───────────────────
  const summaryId: (string | null)[] = summary.map(() => null)
  const aside: boolean[] = summary.map(() => false)
  const asideIds = new Set<string>()
  if (!noIds) {
    const claimed = new Set<string>()
    const ambiguous: { i: number; ids: string[] }[] = []
    summary.forEach((l, i) => {
      if (!l.label || undetermined(l.label)) return
      const ids = idx.idsOf(l.label)
      if (ids.size === 1) {
        const id = [...ids][0]!
        summaryId[i] = id
        claimed.add(id)
      } else if (ids.size > 1) ambiguous.push({ i, ids: [...ids].sort() })
    })
    // Seul candidat au centime, CA > 0, non pris par une ligne non ambiguë — et visé par cette
    // seule ligne : deux lignes ambiguës sur le même candidat restent toutes deux de côté (D3,
    // sans dépendre de l'ordre du résumé).
    const fits = ambiguous.map((a) => {
      const c = cents(summary[a.i]!.ca)
      return c > 0 ? a.ids.filter((id) => !claimed.has(id) && (salesCents.get(id) ?? 0) === c) : []
    })
    const aimedBy = new Map<string, number>()
    for (const f of fits) if (f.length === 1) aimedBy.set(f[0]!, (aimedBy.get(f[0]!) ?? 0) + 1)
    const asideByKey = new Map<string, { issue: IdentityIssue; cents: number; lines: number; ids: Set<string> }>()
    ambiguous.forEach((a, k) => {
      const l = summary[a.i]!
      const f = fits[k]!
      if (f.length === 1 && aimedBy.get(f[0]!) === 1) {
        summaryId[a.i] = f[0]!
        return
      }
      aside[a.i] = true
      const c = cents(l.ca)
      // 0 € : rien n'est mis de côté (homonymes dormants, chaque nuit) — pas d'anomalie, et surtout les
      // ids candidats restent sous l'invariant : un écart réel sur l'un d'eux ne doit pas passer.
      if (c === 0) return
      // Un id déjà pris par sa propre ligne non ambiguë garde l'invariant : son écart doit rester vu.
      for (const id of a.ids) if (!claimed.has(id)) asideIds.add(id)
      const key = resumeKey(day, norm(l.label))
      let e = asideByKey.get(key)
      if (!e) {
        e = {
          issue: {
            issueKey: key,
            kind: 'resume_mis_de_cote',
            mypulsUserId: null,
            label: l.label,
            chatterId: null,
            otherChatterId: null,
            day,
            amount: 0,
            detail: '',
          },
          cents: 0,
          lines: 0,
          ids: new Set(),
        }
        asideByKey.set(key, e)
        issue(e.issue)
      }
      // Même libellé (normalisé) mis de côté plusieurs fois le même jour : montants additionnés.
      e.cents += c
      e.lines += 1
      for (const id of a.ids) e.ids.add(id)
      const list = [...e.ids].sort()
      e.issue.amount = e.cents / 100
      e.issue.detail = `Le libellé « ${e.issue.label} » désigne ${list.length} comptes MyPuls (${list.join(', ')}) et le montant ne les départage pas : ${e.lines > 1 ? `${e.lines} lignes, ` : ''}${eur(e.cents)} € du résumé mis de côté.`
    })
  }
  out.summaryIds = summaryId

  // ── Fiche de chaque id du jour ───────────────────────────────────────────────────────────────
  const labelsById = new Map<string, { labels: Set<string>; summaryLabel: string | null }>()
  const seeLabel = (id: string, raw: string, fromSummary: boolean): void => {
    const e = labelsById.get(id) ?? { labels: new Set<string>(), summaryLabel: null }
    if (raw) e.labels.add(raw)
    if (fromSummary && e.summaryLabel === null) e.summaryLabel = raw
    labelsById.set(id, e)
  }
  summary.forEach((l, i) => {
    const id = summaryId[i]
    if (id) seeLabel(id, l.label, true)
  })
  if (!noIds) for (const s of sales) if (s.mypulsUserId) seeLabel(s.mypulsUserId, s.label, false)

  const ids = [...labelsById.keys()].sort(byMypulsId)
  const labelsOf = (id: string): string[] => [...(labelsById.get(id)?.labels ?? [])].sort()
  const nameOf = (id: string): string | null => labelsById.get(id)?.summaryLabel ?? labelsOf(id)[0] ?? null
  /** Un libellé qui désigne plusieurs comptes ce jour : ni lien ni alias par lui. */
  const ambiguousLabel = (raw: string): boolean => idx.idsOf(raw).size > 1
  /** Fiche d'un libellé selon l'état EN BASE seulement (pas les alias posés aujourd'hui). */
  const inBase = (raw: string): string | undefined => {
    const n = norm(raw)
    return state.aliasOf(n) ?? state.byName(raw) ?? state.byEmail(n)
  }
  const hasId = (f: string): boolean => (state.mypulsIdByChatter.get(f) ?? null) !== null

  // 1. Fiches que désignent les libellés de chaque id, et comptes qui désignent chaque fiche.
  type Found = { fiche: string; raw: string }
  const foundById = new Map<string, Found[]>()
  const idsOfFiche = new Map<string, Set<string>>()
  for (const id of ids) {
    const found: Found[] = []
    for (const raw of labelsOf(id)) {
      if (undetermined(raw)) continue // une pseudo-fiche ne reçoit jamais d'id
      const f = inBase(raw)
      if (!f) continue
      if (!found.some((x) => x.fiche === f)) found.push({ fiche: f, raw })
      const s = idsOfFiche.get(f) ?? new Set<string>()
      s.add(id)
      if (ambiguousLabel(raw)) for (const other of idx.idsOf(raw)) s.add(other)
      idsOfFiche.set(f, s)
    }
    foundById.set(id, found)
  }
  // 2. Fiche sans id désignée par plusieurs comptes ce jour : la relier serait deviner.
  const contested = (f: string): boolean => (idsOfFiche.get(f)?.size ?? 0) > 1
  const homonyme = (a: Found): void => {
    const list = [...idsOfFiche.get(a.fiche)!].sort(byMypulsId)
    issue({
      issueKey: homonymeKey(a.fiche),
      kind: 'homonyme',
      mypulsUserId: null,
      label: a.raw,
      chatterId: a.fiche,
      otherChatterId: null,
      day,
      amount: null,
      detail: `La fiche « ${a.raw} », sans id MyPuls, est désignée ce jour par ${list.length} comptes MyPuls (${list.join(', ')}) : aucun id posé, chaque compte a sa propre fiche ; à trancher à la main.`,
    })
  }
  const doublon = (id: string, keep: string, other: string, raw: string): void => {
    issue({
      issueKey: doublonKey(keep, other),
      kind: 'doublon',
      mypulsUserId: id,
      label: raw,
      chatterId: keep,
      otherChatterId: other,
      day,
      amount: null,
      detail: `L'id MyPuls ${id} est porté par une fiche, mais le libellé « ${raw} » désigne une autre fiche sans id : même compte coupé en deux, à fusionner.`,
    })
  }
  /** Alias des libellés d'un id : jamais un libellé à plusieurs comptes (ce serait deviner). */
  const aliasesOfId = (chatterId: string, id: string): void => {
    for (const raw of labelsOf(id)) if (!ambiguousLabel(raw)) addAlias(chatterId, raw)
  }

  // 3. Décision par id, dans l'ordre des ids.
  const chatterOfId = new Map<string, string | null>() // null = membres multiples : lignes par libellé
  for (const id of ids) {
    const found = foundById.get(id)!
    // Une fiche par alias QUI A SON PROPRE id est un homonyme au sens D4 : ni lien ni doublon.
    const free = found.filter((a) => !hasId(a.fiche))
    for (const a of free) if (contested(a.fiche)) homonyme(a)
    const clean = free.filter((a) => !contested(a.fiche))

    const owner = state.chatterByMypulsId.get(id)
    if (owner) {
      chatterOfId.set(id, owner)
      for (const a of clean) doublon(id, owner, a.fiche, a.raw)
      aliasesOfId(owner, id)
      continue
    }

    let pick: string | undefined
    if (clean.length === 1) pick = clean[0]!.fiche
    else if (clean.length > 1) {
      const linked = clean.filter((a) => state.linkedChatters.has(a.fiche))
      if (linked.length > 1) {
        chatterOfId.set(id, null)
        issue({
          issueKey: membresKey(id),
          kind: 'membres_multiples',
          mypulsUserId: id,
          label: linked[0]!.raw,
          chatterId: linked[0]!.fiche,
          otherChatterId: linked[1]!.fiche,
          day,
          amount: null,
          detail: `L'id MyPuls ${id} correspond à ${linked.length} fiches reliées chacune à un membre (${linked.map((a) => `« ${a.raw} »`).join(', ')}) : rien n'est posé, à trancher à la main.`,
        })
        continue
      }
      // La fiche payée d'abord (la paie lit `profiles.chatter_id`), sinon celle du résumé.
      const summaryLabel = labelsById.get(id)!.summaryLabel
      const summaryFiche = summaryLabel ? inBase(summaryLabel) : undefined
      pick = linked[0]?.fiche ?? clean.find((a) => a.fiche === summaryFiche)?.fiche ?? clean[0]!.fiche
      for (const a of clean) if (a.fiche !== pick) doublon(id, pick, a.fiche, a.raw)
    }

    if (pick) {
      out.links.push({ chatterId: pick, mypulsUserId: id })
      chatterOfId.set(id, pick)
      aliasesOfId(pick, id)
      continue
    }

    const created = newId()
    const displayName = nameOf(id) ?? id
    out.newChatters.push({ id: created, displayName, mypulsUserId: id })
    chatterOfId.set(id, created)
    aliasesOfId(created, id)
    issue({
      issueKey: ficheCreeeKey(id),
      kind: 'fiche_creee',
      mypulsUserId: id,
      label: displayName,
      chatterId: created,
      otherChatterId: null,
      day,
      amount: null,
      detail: found.length
        ? `Fiche créée pour l'id MyPuls ${id} (« ${displayName} ») : ce libellé désigne déjà une fiche qui n'est pas sûrement la sienne (homonyme).`
        : `Fiche créée pour l'id MyPuls ${id} (« ${displayName} »).`,
    })
  }

  // ── Fiche de chaque ligne ────────────────────────────────────────────────────────────────────
  const lineFiche = (raw: string, id: string | null): string | null => {
    if (id) {
      const f = chatterOfId.get(id)
      if (f) return f
      // Membres multiples : la fiche du libellé si elle existe, jamais une fiche créée sans id.
      if (f === null) return byLabel(raw) ?? null
    }
    return raw ? byLabelOrCreate(raw) : null
  }
  summary.forEach((l, i) => {
    out.summaryChatter.push(aside[i] || !l.label ? null : lineFiche(l.label, summaryId[i] ?? null))
  })
  for (const s of sales) out.saleChatter.push(lineFiche(s.label, s.mypulsUserId))

  // ── Invariant : CA du résumé = Σ ventes du même id, au centime ───────────────────────────────
  if (!noIds) {
    const summaryCents = new Map<string, number>()
    summary.forEach((l, i) => {
      const id = summaryId[i]
      if (id) summaryCents.set(id, (summaryCents.get(id) ?? 0) + cents(l.ca))
    })
    for (const id of [...new Set([...summaryCents.keys(), ...salesCents.keys()])].sort(byMypulsId)) {
      if (asideIds.has(id)) continue
      const a = summaryCents.get(id) ?? 0
      const b = salesCents.get(id) ?? 0
      if (a === b) continue
      const raw = nameOf(id)
      issue({
        issueKey: ecartKey(day, id),
        kind: 'ecart_invariant',
        mypulsUserId: id,
        label: raw,
        chatterId: chatterOfId.get(id) ?? null,
        otherChatterId: null,
        day,
        amount: (b - a) / 100,
        detail: `Id MyPuls ${id}${raw ? ` (« ${raw} »)` : ''} : ${eur(a)} € au résumé, ${eur(b)} € de ventes ce jour-là.`,
      })
    }
  }

  return out
}
