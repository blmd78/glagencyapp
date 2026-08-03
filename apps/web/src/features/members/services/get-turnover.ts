import { turnoverRate } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type { TurnoverData } from '../types'

/** Miroir TS du `json` de `turnover_report` (0103) — `Returns: Json` côté Postgres. */
interface TurnoverReport {
  by_day: { jour: string; entrees: number; sorties: number; effectif: number }[]
  headcount: number
  departures: { name: string; reason: string; left_at: string; tenure_days: number | null }[]
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
  const rep = (data as TurnoverReport | null) ?? {
    by_day: [],
    headcount: 0,
    departures: [],
    tenure: { sum_days: 0, known: 0, exits: 0 },
  }

  const days = rep.by_day.map((d) => ({
    jour: d.jour,
    entrees: Number(d.entrees) || 0,
    sorties: Number(d.sorties) || 0,
    effectif: Number(d.effectif) || 0,
  }))

  // Effectif MOYEN de la fenêtre — désormais une vraie moyenne JOUR PAR JOUR, et non plus une
  // moyenne de fins de mois : le RPC donne le point quotidien depuis 0108.
  const avgHeadcount = days.length ? days.reduce((s, d) => s + d.effectif, 0) / days.length : 0
  const exits = Number(rep.tenure.exits) || 0
  const known = Number(rep.tenure.known) || 0

  return {
    from,
    to: period.to,
    days,
    departures: rep.departures.map((d) => ({
      name: d.name,
      reason: d.reason,
      leftAt: d.left_at,
      tenureDays: d.tenure_days === null ? null : Number(d.tenure_days),
    })),
    exits,
    entries: days.reduce((s, d) => s + d.entrees, 0),
    // Effectif À CET INSTANT, donné par le RPC — plus une extrapolation du dernier point.
    headcount: Number(rep.headcount) || 0,
    rate: turnoverRate(exits, avgHeadcount),
    /** Moyenne SEULEMENT sur les départs à l'arrivée connue — `known` est le dénominateur que la
     *  vue affiche à côté (« sur 7 départs sur 12 »). null = aucun départ mesurable. */
    tenureAvgDays: known > 0 ? Math.round((Number(rep.tenure.sum_days) || 0) / known) : null,
    tenureKnown: known,
  }
}
