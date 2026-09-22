import { addDays, endOfMonth, round1, startOfMonth, todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import { eur, int } from '@/lib/format'
import type { DailyPoint, Insight, Kpi, ModelCa, ModelSubs, OverviewData } from '../types'

/** Forme brute renvoyée par le RPC `overview_report` (0052, étendu par 0164) — agrégée EN BASE. */
interface OverviewReport {
  /** Par modèle sur la période (CA + nouveaux abonnés). MyPuls + Uncove RATTACHÉ (0164). */
  by_model: Array<{ creator_id: string; ca: number | null; new_subs: number | null }>
  /** CA total par jour sur le(s) mois du graphe. MyPuls + Uncove (0164). */
  daily: Array<{ date: string; ca: number | null }>
  /** CA par chatteur sur la période (source selon le rôle). Jamais Uncove : aucun chatteur derrière. */
  by_chatter: Array<{ chatter_id: string; ca: number | null }>
  /**
   * Totaux de la période par SOURCE (0164). `uncove` vaut `null` — et non 0 — quand il n'y a
   * rien à compter (non-admin, ou aucun compte marqué « CA hors MyPuls ») : c'est ce qui décide
   * de l'AFFICHAGE des cartes « CA MyPuls » / « CA Uncove ». Un compte relevé sans CA rend 0.
   */
  totals: { mypuls: number | null; uncove: number | null }
}

/**
 * Overview agrégée sur la période choisie (datepicker du header).
 * Source : `creator_daily` (CA/modèle/abonnés/série) + `chatter_daily` (actifs/com).
 * Tout vient de la DB (ingestion quotidienne) ; insights vides tant que le moteur de
 * règles @glagency/core n'est pas branché.
 *
 * Mode `restricted` (rôle `user`) : `chatter_daily` est admin-only en RLS (retournerait
 * [] SANS erreur → KPIs à 0 mensongers). Les KPIs chatteurs se calculent alors depuis
 * `chatter_creator_daily` (limité par la RLS à SES modèles).
 */
export async function getOverview(
  period: Period,
  opts: { restricted?: boolean; caGlobal?: boolean; courbeGlobale?: boolean } = {},
): Promise<OverviewData> {
  const restricted = opts.restricted ?? false
  // Bouts de page `overview:ca` / `overview:courbe` (0139) : le KPI et/ou la courbe passent au
  // CA de L'AGENCE. Sans objet pour un admin, dont les deux sont déjà globaux — d'où le `&&
  // restricted`, qui évite aussi un aller-retour SQL inutile sur chaque affichage admin.
  const caGlobal = restricted && (opts.caGlobal ?? false)
  const courbeGlobale = restricted && (opts.courbeGlobale ?? false)
  const supabase = await createClient()

  // Le graphe CA quotidien couvre toujours le(s) mois entier(s) de la sélection :
  // on élargit la requête `creator_daily`, mais KPIs/classements restent bornés à la période.
  const chartFrom = startOfMonth(period.from)
  const chartTo = endOfMonth(period.to)

  const [{ data: creators, error: creatorsErr }, rpcRes, denomBase, globalRes] =
    await Promise.all([
      supabase.from('creators').select('id, name, is_private'),
      // Agrégation EN BASE (migration 0052 overview_report, SECURITY INVOKER = RLS appliquée) :
      // par modèle (période) + série quotidienne (mois du graphe) + CA par chatteur (période,
      // source selon le rôle). Plus de fetchAll journalier ni de reduce JS. RPC typé (nom +
      // args, dans packages/db/src/types.ts) — pas de `as never` (docs/guidelines-data-loading.md §1).
      supabase.rpc('overview_report', {
        p_period_from: period.from,
        p_period_to: period.to,
        p_chart_from: chartFrom,
        p_chart_to: chartTo,
        p_restricted: restricted,
      }),
      // Dénominateur « Chatteurs actifs X / Y » : Y = l'EFFECTIF RÉEL, les MEMBRES rôle
      // chatteur (`profiles`) — PAS la table MyPuls `chatters`, qui accumule sans purge tous
      // les comptes jamais scrapés (~318) et gonflait le chiffre (demande Benoit 2026-07-29 :
      // « des vraies données »). Lisible sous RLS par tout encadrant depuis 0097. X (actifs
      // MyPuls avec CA) peut en théorie dépasser Y si un compte actif n'a pas de membre —
      // c'est alors un trou de données à régler dans Membres, pas un bug d'affichage.
      // En restricted (chatteur), `profiles` est self-only sous RLS → Y se compte depuis
      // `chatter_creators` (liaisons actives de SES modèles), comme avant. Set (pas .size) :
      // complété plus bas par les chatteurs à CA dont la liaison a été désactivée depuis —
      // sinon X > Y possible. fetchAll : cap PostgREST.
      restricted
        ? fetchAll((f, t) =>
            supabase
              .from('chatter_creators')
              .select('chatter_id')
              .eq('active', true)
              .order('chatter_id')
              .order('creator_id')
              .range(f, t),
          ).then(({ data, error }) => {
            if (error) throw new Error(error.message)
            return new Set((data ?? []).map((r) => r.chatter_id).filter(Boolean))
          })
        : fetchAll((f, t) =>
            supabase
              .from('profiles')
              .select('id, chatter_id')
              .eq('role', 'chatteur')
              // Les partis (0102) sortent de l'effectif : ce périmètre décrit l'équipe actuelle.
              .is('left_at', null)
              .order('id')
              .range(f, t),
          ).then(({ data, error }) => {
            if (error) throw new Error(error.message)
            return (data ?? []).map((m) => m.chatter_id)
          }),
      // CA AGENCE (0139) — `security definer`, car la RLS `creator_daily_scoped_read` filtre des
      // LIGNES et ne sait pas rendre un total sur celles qu'elle cache. Retour scalaire, aucun
      // `creator_id` : il n'y a rien à ventiler dedans. Chaque champ est gardé par SON bout côté
      // SQL → `total`/`daily` reviennent `null` quand le droit correspondant manque.
      caGlobal || courbeGlobale
        ? supabase.rpc('overview_ca_global', {
            p_period_from: period.from,
            p_period_to: period.to,
            p_chart_from: chartFrom,
            p_chart_to: chartTo,
          })
        : null,
    ])

  if (creatorsErr) throw new Error(creatorsErr.message)
  if (rpcRes.error) throw new Error(rpcRes.error.message)
  // Retour `Returns: Json` → cast documenté vers le contrat local (pas `.overrideTypes`,
  // inapplicable sur l'union Json avec postgrest-js 2.110 — cf. docs/guidelines-data-loading.md §1).
  const rep = (rpcRes.data as OverviewReport | null) ?? {
    by_model: [],
    daily: [],
    by_chatter: [],
    totals: { mypuls: null, uncove: null },
  }

  if (globalRes?.error) throw new Error(globalRes.error.message)
  // Retour `Returns: Json` → même cast documenté que `rep` ci-dessus. `total`/`daily` valent
  // `null` quand le bout correspondant n'est pas accordé (garde SQL, pas garde TS).
  const glob =
    (globalRes?.data as { total: number | null; daily: Array<{ date: string; ca: number | null }> | null } | null) ??
    null

  const meta = new Map((creators ?? []).map((c) => [c.id, { name: c.name, isPrivate: c.is_private }]))
  // `totalCa` reste le total DE SON PÉRIMÈTRE : il sert aux parts par modèle ci-dessous. Le KPI,
  // lui, lit `kpiCa` — deux variables distinctes, pour qu'accorder `overview:ca` ne redéfinisse
  // pas en douce ce que « part » veut dire.
  const totalCa = rep.by_model.reduce((s, r) => s + (Number(r.ca) || 0), 0)
  // CA par source (0164). `caUncove` non nul = il y a un CA Uncove à montrer → 2 cartes de plus.
  // Le KPI « CA total » les additionne ; `totalCa` (dénominateur des parts) reste le CA VENTILÉ,
  // donc l'Uncove non rattaché manque au classement sans fausser les pourcentages.
  // Repli sur le CA ventilé si `totals` manque : la RPC d'avant 0164 ne le rend pas, et le code
  // peut se déployer avant la migration — sans ce repli le KPI « CA total » afficherait 0 €.
  const caMypuls = rep.totals?.mypuls == null ? totalCa : Number(rep.totals.mypuls)
  const caUncove = rep.totals?.uncove == null ? null : Number(rep.totals.uncove)
  const kpiCa = glob?.total != null ? Number(glob.total) : caMypuls + (caUncove ?? 0)

  // Agrégat par modèle (déjà sommé par le RPC, regroupé par nom).
  const byModel = new Map<string, { ca: number; subs: number; isPrivate: boolean }>()
  for (const r of rep.by_model) {
    const m = meta.get(r.creator_id)
    if (!m) continue
    const cur = byModel.get(m.name) ?? { ca: 0, subs: 0, isPrivate: m.isPrivate }
    cur.ca += Number(r.ca) || 0
    cur.subs += Number(r.new_subs) || 0
    byModel.set(m.name, cur)
  }
  const caByModel: ModelCa[] = [...byModel]
    .map(([name, m]) => ({
      name,
      ca: m.ca,
      part: totalCa ? round1((m.ca / totalCa) * 100) : 0,
      isPrivate: m.isPrivate,
    }))
    .sort((a, b) => b.ca - a.ca)
  const subsByModel: ModelSubs[] = [...byModel]
    .map(([name, m]) => ({ name, subs: m.subs }))
    .filter((x) => x.subs > 0)
    .sort((a, b) => b.subs - a.subs)

  // Série quotidienne : TOUS les jours du/des mois couvrant la sélection ; null après
  // aujourd'hui ; les jours hors sélection sont marqués `inPeriod: false` (affichés atténués).
  const perDay = new Map<string, number>()
  for (const r of glob?.daily ?? rep.daily) perDay.set(r.date, Number(r.ca) || 0)
  const today = todayParis()
  const daily: DailyPoint[] = []
  for (let key = chartFrom; key <= chartTo; key = addDays(key, 1)) {
    daily.push({
      date: key,
      revenue: key <= today ? (perDay.get(key) ?? 0) : null,
      inPeriod: key >= period.from && key <= period.to,
    })
  }

  // Chatteurs : actifs et CA moyen. La carte « Sous 200 € de com » a été RETIRÉE le 2026-09-22
  // (demande Benoit) — le barème de commission n'a jamais été celui de l'app (10 % en dur) et la
  // place sert aux trois cartes de CA.
  //
  // TOUS les KPIs « personnes » se calculent sur les MEMBRES rôle chatteur (demande Benoit
  // 2026-07-29 : « des vraies données ») : le CA d'un membre se lit via son lien MyPuls
  // (profiles.chatter_id → by_chatter) ; membre non lié ou sans donnée = 0 € (donc actif non —
  // c'est la vérité). En restricted (chatteur, profiles self-only sous RLS), on garde l'ancien
  // calcul par comptes MyPuls scopés à ses modèles.
  const caByChatter = new Map<string, number>()
  for (const r of rep.by_chatter) caByChatter.set(r.chatter_id, Number(r.ca) || 0)
  let active: number
  let avgCa: number
  let totalChatters: number
  if (denomBase instanceof Set) {
    // Restricted : ids MyPuls des liaisons actives ∪ chatteurs avec CA (X ≤ Y garanti).
    const activeCas = [...caByChatter.values()].filter((v) => v > 0)
    active = activeCas.length
    avgCa = active ? activeCas.reduce((s, v) => s + v, 0) / active : 0
    const withCa = [...caByChatter.entries()].filter(([, v]) => v > 0).map(([id]) => id)
    totalChatters = new Set([...denomBase, ...withCa]).size
  } else {
    const cas = denomBase.map((chatterId) => (chatterId ? (caByChatter.get(chatterId) ?? 0) : 0))
    const actives = cas.filter((v) => v > 0)
    active = actives.length
    avgCa = active ? actives.reduce((s, v) => s + v, 0) / active : 0
    totalChatters = cas.length
  }

  const scopeHint = restricted ? 'sur tes modèles' : 'sur la période'
  const kpis: Kpi[] = [
    {
      key: 'ca',
      label: 'CA total',
      value: eur(kpiCa),
      deltaPct: null,
      trendLabel: caGlobal ? 'Total agence' : restricted ? 'Total (tes modèles)' : 'Total',
      hint: period.label,
      ...(caUncove == null ? {} : { info: 'CA MyPuls + CA Uncove. Uncove n’est pas relevé par MyPuls : les deux sources s’additionnent, aucun jour n’est compté deux fois.' }),
    },
    // Les deux sources détaillées, demandées par Benoit le 2026-09-22 (« le CA global, et le CA
    // MyPuls, et le CA Uncove »). Réservées à l'admin par la RPC : un encadrant garde un CA
    // 100 % MyPuls, et ces cartes-là n'auraient rien à lui dire.
    ...(caUncove == null
      ? []
      : [
          { key: 'caMypuls', label: 'CA MyPuls', value: eur(caMypuls), deltaPct: null, trendLabel: 'Relevé MyPuls', hint: period.label } satisfies Kpi,
          {
            key: 'caUncove',
            label: 'CA Uncove',
            value: eur(caUncove),
            deltaPct: null,
            trendLabel: 'Relevé Uncove',
            hint: period.label,
            info: 'Comptes Uncove marqués « CA hors MyPuls » dans Uncove › Modèles. Un compte sans modèle rattachée compte ici et dans le CA total, mais sur aucune ligne du classement par modèle.',
          } satisfies Kpi,
        ]),
    // KPIs CHATTEURS retirés dès qu'un bout `overview:*` est accordé (décision Benoit
    // 2026-09-02, « si je coche ces 2 droits ils n'ont rien à faire là ») : ces bouts donnent le
    // CA de l'agence, et ces deux cartes-là comptent sur les modèles assignés. Les laisser, c'est
    // afficher deux périmètres côte à côte — et « 0 / N » chez qui n'a aucun modèle.
    ...(caGlobal || courbeGlobale
      ? []
      : [
          { key: 'active', label: 'Chatters actifs', value: `${active} / ${totalChatters}`, deltaPct: null, trendLabel: `${active} avec CA`, hint: restricted ? scopeHint : 'effectif = membres rôle chatter' } satisfies Kpi,
          { key: 'avgCa', label: 'CA moyen / chatter', value: eur(avgCa), deltaPct: null, trendLabel: 'Moyenne des actifs', hint: restricted ? `${int(active)} chatters, ${scopeHint}` : `${int(active)} chatters avec CA` } satisfies Kpi,
        ]),
  ]

  // Insights : vides tant que le moteur de règles @glagency/core n'est pas branché.
  const insights: Insight[] = []

  // Le suffixe n'apparaît QUE pour un porteur de bout : sans lui, KPI et courbe décrivent le
  // même périmètre et le titre nu ne ment pas. Ne rien changer pour les autres est délibéré.
  const dailyScope =
    !caGlobal && !courbeGlobale ? null : courbeGlobale ? 'agence' : 'vos modèles'

  return { periodLabel: period.label, kpis, caByModel, subsByModel, daily, dailyScope, insights }
}
