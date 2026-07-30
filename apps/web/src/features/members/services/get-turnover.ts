import { todayParis, tenureDays, turnoverRate } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type { TurnoverData } from '../types'

/** Miroir TS du `json` de `turnover_report` (0103) — `Returns: Json` côté Postgres. */
interface TurnoverReport {
  by_month: { mois: string; entrees: number; sorties: number; effectif_fin: number }[]
  by_reason: { reason: string; n: number }[]
  tenure: { sum_days: number; known: number; exits: number }
}

/**
 * Statistiques de turnover de l'agence (onglet de la page Membres).
 *
 * ── LA FENÊTRE NE REMONTE PAS BÊTEMENT À 12 MOIS ──────────────────────────────────────────────
 * Elle démarre au PREMIER MOUVEMENT RÉELLEMENT CONNU (plus ancienne arrivée saisie, à défaut plus
 * ancienne création de compte), plafonné à 12 mois. Sans cette borne, le graphe afficherait des
 * mois à effectif ~0 avant le peuplement du CRM (tous les comptes datent du 17-29 juillet 2026),
 * puis un bond à 110 : ça se lirait comme une croissance explosive alors que c'est une absence de
 * donnée. Mieux vaut un graphe court et vrai qu'un graphe long et faux.
 *
 * Le bandeau de la vue dit la même chose en toutes lettres — la borne évite le contresens visuel,
 * la phrase évite le contresens tout court.
 */
export async function getTurnover(): Promise<TurnoverData> {
  const supabase = await createClient()
  const today = todayParis()

  // Premier mouvement connu. `created_at` en repli : au démarrage, personne n'a d'`arrived_at`.
  const { data: oldest, error: oldestErr } = await supabase
    .from('profiles')
    .select('arrived_at, created_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (oldestErr) throw new Error(oldestErr.message)

  const firstKnown = oldest?.arrived_at ?? oldest?.created_at?.slice(0, 10) ?? today
  const twelveMonthsAgo = `${new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86_400_000)
    .toISOString()
    .slice(0, 7)}-01`
  const from = firstKnown > twelveMonthsAgo ? `${firstKnown.slice(0, 7)}-01` : twelveMonthsAgo

  const { data, error } = await supabase.rpc('turnover_report', { p_from: from, p_to: today })
  if (error) throw new Error(error.message)
  // `Returns: Json` → cast documenté vers le contrat local (pas `.overrideTypes`, inapplicable
  // sur l'union Json avec postgrest-js — cf. guidelines-data-loading §1).
  const rep = (data as TurnoverReport | null) ?? { by_month: [], by_reason: [], tenure: { sum_days: 0, known: 0, exits: 0 } }

  const months = rep.by_month.map((m) => ({
    mois: m.mois,
    entrees: Number(m.entrees) || 0,
    sorties: Number(m.sorties) || 0,
    effectif: Number(m.effectif_fin) || 0,
  }))

  // Effectif MOYEN de la fenêtre = moyenne des fins de mois. Approximation assumée et suffisante
  // pour un taux : la mesure exacte (moyenne jour par jour) ne changerait pas la décision qu'on
  // prend en le lisant.
  const avgHeadcount = months.length
    ? months.reduce((s, m) => s + m.effectif, 0) / months.length
    : 0
  const exits = Number(rep.tenure.exits) || 0
  const known = Number(rep.tenure.known) || 0

  return {
    from,
    to: today,
    months,
    reasons: rep.by_reason.map((r) => ({ reason: r.reason, n: Number(r.n) || 0 })),
    exits,
    entries: months.reduce((s, m) => s + m.entrees, 0),
    headcount: months.at(-1)?.effectif ?? 0,
    rate: turnoverRate(exits, avgHeadcount),
    /** Moyenne SEULEMENT sur les départs à l'arrivée connue — `known` est le dénominateur que la
     *  vue affiche à côté (« sur 7 départs sur 12 »). null = aucun départ mesurable. */
    tenureAvgDays: known > 0 ? Math.round((Number(rep.tenure.sum_days) || 0) / known) : null,
    tenureKnown: known,
  }
}

/** Ré-export local : la vue calcule l'ancienneté d'un départ isolé avec la même règle. */
export { tenureDays }
