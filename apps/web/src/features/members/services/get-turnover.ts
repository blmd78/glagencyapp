import { tenureDays, turnoverRate } from '@glagency/core'
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
 * ── LA PÉRIODE EST CELLE DU DATEPICKER GLOBAL ─────────────────────────────────────────────────
 * `?from=&to=` résolus par `lib/period.ts`, comme partout ailleurs dans le CRM (demande Benoit
 * 2026-07-30). Le sélecteur du header pilote donc aussi cet onglet — une page du CRM qui
 * ignorerait le datepicker affiché juste au-dessus d'elle serait un piège.
 *
 * Le mois de la borne de DÉBUT est rendu ENTIER : le graphe raisonne par mois, afficher un
 * demi-mois de janvier à côté de mois pleins ferait lire une chute d'activité là où il n'y a
 * qu'une borne au milieu du mois.
 *
 * Contrepartie assumée : rien n'empêche de choisir une période antérieure au peuplement du CRM,
 * où l'effectif ressortira à ~0 faute de dates d'arrivée saisies. C'est le rôle du bandeau de la
 * vue de le dire — on préfère avertir que brider le choix de l'utilisateur.
 */
export async function getTurnover(period: { from: string; to: string }): Promise<TurnoverData> {
  const supabase = await createClient()
  // Mois entier côté début (cf. ci-dessus) ; la borne de fin reste telle quelle — le mois en
  // cours est partiel par nature, et le lecteur le sait.
  const from = `${period.from.slice(0, 7)}-01`

  const { data, error } = await supabase.rpc('turnover_report', { p_from: from, p_to: period.to })
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
    to: period.to,
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
