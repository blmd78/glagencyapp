import type { DayIdentity, SaleLine, SummaryLine } from './chatter-identity'
import { UNDETERMINED_LABEL } from './identity-types'

/**
 * Contrôles de fiabilité d'UNE journée (spec § 3, D5). Côté code : a (résumé = ventes par compte),
 * b_total_page (lignes lues = totaux affichés par la page MyPuls) et c (une fiche = un compte).
 * b_resume_ecrit / b_ventes_ecrites sont calculés EN BASE par `finish_chatter_day` (0183), à
 * partir de `expected` : on y prouve l'état réel des tables, pas ce que le code croit avoir écrit.
 */

// `type` et non `interface` : ces objets partent tels quels vers la RPC `finish_chatter_day`, typée
// `Json` par supabase-js, qui n'accepte que des types objets littéraux.
export type DayCheck = {
  code: string
  ok: boolean
  detail: string
}

/** Ce que la base doit contenir pour le jour, en centimes, et les totaux de la page MyPuls. */
export type ExpectedTotals = {
  summary_cents: number
  sales_cents: number
  sales_count: number
  page_net_cents: number | null
  page_sales_count: number | null
}

const cents = (n: number): number => Math.round(n * 100)
const eur = (c: number): string => (c / 100).toFixed(2).replace('.', ',')

export function expectedDayTotals(input: {
  summary: { caPpv: number; caTips: number }[]
  sales: { amount: number }[]
  page: { salesCount: number | null; net: number | null }
}): ExpectedTotals {
  return {
    // chatter_daily.ca = PPV + tips (CHECK de la table) : on attend la même somme, ligne par ligne.
    summary_cents: input.summary.reduce((s, c) => s + cents(c.caPpv) + cents(c.caTips), 0),
    sales_cents: input.sales.reduce((s, t) => s + cents(t.amount), 0),
    sales_count: input.sales.length,
    // Total de page absent OU illisible (NaN, ±Infinity) = null : jamais un 0 ni un NaN qui se
    // ferait passer pour un total. `b_total_page` échoue alors, explicitement.
    page_net_cents: input.page.net === null || !Number.isFinite(input.page.net) ? null : cents(input.page.net),
    page_sales_count:
      input.page.salesCount === null || !Number.isFinite(input.page.salesCount) ? null : input.page.salesCount,
  }
}

export function dayChecks(input: {
  summary: SummaryLine[]
  sales: SaleLine[]
  identity: DayIdentity
  /** Id MyPuls porté par une fiche AVANT la journée (état chargé en tête de run). */
  mypulsIdOf: (chatterId: string) => string | null
  expected: ExpectedTotals
}): DayCheck[] {
  const { identity: idn, expected: e } = input
  const checks: DayCheck[] = []

  // a — résumé = ventes, par compte
  const ecarts = idn.issues.filter((i) => i.kind === 'ecart_invariant')
  // Ligne de résumé avec un CA mais sans compte MyPuls : le résolveur ne compare que des ids, une telle
  // ligne n'est comparée à rien — et b1 (base) est vert puisqu'elle est bien écrite. On l'attrape ici.
  // Hors contrôle : libellé vide, « Indéterminé (…) » (jamais d'id), CA de 0 € (rien de perdu), et ligne
  // mise de côté (`summaryChatter` nul : libellé à plusieurs comptes, déjà signalé et attrapé par b1).
  const sansVentes = input.summary.flatMap((l, i) =>
    l.label &&
    !UNDETERMINED_LABEL.test(l.label) &&
    idn.summaryIds[i] === null &&
    idn.summaryChatter[i] !== null &&
    cents(l.ca) !== 0
      ? [`${l.label} ${eur(cents(l.ca))} €`]
      : [],
  )
  // Vente sans id (hors « Indéterminé (…) », qui n'en a jamais) un jour où les ids sont lus : son montant
  // ne tombe dans la somme d'AUCUN compte, l'invariant par id ne la voit pas. C'est donc a qui l'attrape
  // (et non c : c juge les fiches, or cette ligne n'a pas d'id à comparer).
  const ventesSansId = input.sales.flatMap((s) =>
    !s.mypulsUserId && !UNDETERMINED_LABEL.test(s.label) ? [`${s.label || '(sans libellé)'} ${eur(cents(s.amount))} €`] : [],
  )
  const partsA = [
    ecarts.length
      ? `${ecarts.length} compte(s) dont le résumé ne tombe pas sur les ventes : ${ecarts.slice(0, 5).map((i) => i.detail).join(' · ')}`
      : '',
    sansVentes.length ? `résumé sans ventes : ${sansVentes.slice(0, 5).join(', ')}` : '',
    ventesSansId.length ? `vente sans id : ${ventesSansId.slice(0, 5).join(', ')}` : '',
  ].filter(Boolean)
  checks.push(
    idn.noIds
      ? { code: 'a_resume_ventes', ok: false, detail: 'Aucun id MyPuls lu : contrôle par compte impossible.' }
      : partsA.length
        ? { code: 'a_resume_ventes', ok: false, detail: partsA.join(' · ') }
        : { code: 'a_resume_ventes', ok: true, detail: 'Résumé = ventes, au centime, pour chaque compte.' },
  )

  // b3 — totaux affichés par la page MyPuls (indépendants des lignes) = lignes lues
  if (e.page_net_cents === null || e.page_sales_count === null) {
    // Fermé par défaut (D12) : sans total de page, rien ne prouve que les ventes lues sont les bonnes.
    const absentes = [e.page_sales_count === null ? '« Ventes »' : '', e.page_net_cents === null ? '« Montant net »' : ''].filter(Boolean)
    checks.push({
      code: 'b_total_page',
      ok: false,
      detail: `Page MyPuls : total de page introuvable (carte ${absentes.join(' et ')} absente ou illisible) : markup changé ?`,
    })
  } else {
    checks.push({
      code: 'b_total_page',
      ok: e.page_net_cents === e.sales_cents && e.page_sales_count === e.sales_count,
      detail: `Ventes lues : ${eur(e.sales_cents)} € (${e.sales_count}) — page MyPuls : ${eur(e.page_net_cents)} € (${e.page_sales_count}).`,
    })
  }

  // c — une fiche = un compte
  if (idn.noIds) {
    checks.push({ code: 'c_fiche_compte', ok: false, detail: 'Aucun id MyPuls lu : identité non vérifiable ce jour-là.' })
    return checks
  }
  // Fermé par défaut : des listes de résolution qui n'ont pas la longueur des lignes lues (bug du
  // résolveur, désalignement) laisseraient des lignes hors de tout contrôle.
  const longueurs = [
    ['ventes', idn.saleChatter.length, input.sales.length],
    ['résumé (fiches)', idn.summaryChatter.length, input.summary.length],
    ['résumé (ids)', idn.summaryIds.length, input.summary.length],
  ] as const
  const decalees = longueurs.filter(([, got, want]) => got !== want).map(([nom, got, want]) => `${nom} : ${got} résolue(s) pour ${want} ligne(s)`)
  if (decalees.length) {
    checks.push({ code: 'c_fiche_compte', ok: false, detail: `Identité non vérifiable, résolution incomplète : ${decalees.join(' · ')}.` })
    return checks
  }
  const idAfter = new Map<string, string | null>()
  for (const c of idn.newChatters) idAfter.set(c.id, c.mypulsUserId)
  for (const l of idn.links) idAfter.set(l.chatterId, l.mypulsUserId)
  const idOf = (f: string): string | null => (idAfter.has(f) ? (idAfter.get(f) ?? null) : input.mypulsIdOf(f))
  const autreId = new Set<string>()
  const sansId = new Set<string>()
  const sansFiche = new Set<string>()
  const fichesOfId = new Map<string, Set<string>>()
  const see = (id: string, fiche: string | null | undefined, label: string): void => {
    // Ligne d'un id connu, mais attachée à aucune fiche (membres multiples, libellé sans fiche) : non
    // attribuée, donc pas vérifiable — jamais « ok ».
    if (!fiche) {
      sansFiche.add(`« ${label} » (${id})`)
      return
    }
    const s = fichesOfId.get(id) ?? new Set<string>()
    s.add(fiche)
    fichesOfId.set(id, s)
    const has = idOf(fiche)
    if (has === null) sansId.add(`« ${label} » (${id})`)
    else if (has !== id) autreId.add(`« ${label} » (${id} → fiche de ${has})`)
  }
  input.sales.forEach((s, i) => {
    // Comme le résolveur : un id lu sur une vente « Indéterminé (…) » est ignoré (sa pseudo-fiche ne
    // porte jamais d'id), sinon ce contrôle accuserait « vers une fiche sans id » à tort.
    if (s.mypulsUserId && !UNDETERMINED_LABEL.test(s.label)) see(s.mypulsUserId, idn.saleChatter[i], s.label)
  })
  idn.summaryIds.forEach((id, i) => {
    if (id) see(id, idn.summaryChatter[i], input.summary[i]?.label ?? '')
  })
  const multi = [...fichesOfId].filter(([, s]) => s.size > 1).map(([id, s]) => `${id} (${s.size} fiches)`)
  const parts = [
    autreId.size ? `vers la fiche d'un autre id : ${[...autreId].slice(0, 5).join(', ')}` : '',
    sansId.size ? `vers une fiche sans id : ${[...sansId].slice(0, 5).join(', ')}` : '',
    multi.length ? `id sur plusieurs fiches : ${multi.slice(0, 5).join(', ')}` : '',
    sansFiche.size ? `id sans fiche : ${[...sansFiche].slice(0, 5).join(', ')}` : '',
  ].filter(Boolean)
  checks.push({
    code: 'c_fiche_compte',
    ok: parts.length === 0,
    detail: parts.length ? parts.join(' · ') : 'Chaque compte MyPuls du jour tombe sur une seule fiche, qui porte son id.',
  })
  return checks
}
