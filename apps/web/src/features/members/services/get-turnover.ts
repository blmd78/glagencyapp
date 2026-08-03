import { turnoverRate } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type { TurnoverData } from '../types'

/** Miroir TS du `json` de `turnover_report` (0110) — `Returns: Json` côté Postgres. */
interface TurnoverReport {
  by_day: { jour: string; entrees: number; sorties: number; effectif: number }[]
  headcount: number
  departures: { name: string; reason: string; left_at: string; tenure_days: number | null }[]
}

/**
 * Statistiques de turnover de l'agence (onglet de la page Membres). CHATTEURS UNIQUEMENT depuis
 * 0107 : les encadrants sont une poignée et bougent rarement, les mélanger diluait le taux.
 *
 * ── LA PÉRIODE EST CELLE DU DATEPICKER GLOBAL ─────────────────────────────────────────────────
 * `?from=&to=` résolus par `lib/period.ts`, comme partout ailleurs dans le CRM. Le sélecteur du
 * header pilote donc aussi cet onglet — une page qui ignorerait le datepicker affiché juste
 * au-dessus d'elle serait un piège.
 *
 * ── CE QUE LE RPC CALCULE, ET CE QUE CE FICHIER DÉRIVE ───────────────────────────────────────
 * Le RPC ne renvoie que ce que le JS ne peut pas produire : la série quotidienne (qui exige
 * `generate_series`) et l'effectif courant. Les totaux — nombre de départs, ancienneté moyenne —
 * sont DÉRIVÉS de `departures` ici. Ce n'est pas une économie de calcul, c'est une garantie : la
 * moyenne et la liste affichée viennent de la même source, elles ne peuvent plus se contredire.
 * Avant 0110, le RPC comptait les deux séparément — rien n'empêchait « 3 départs » au-dessus
 * d'une liste qui en montrait 2, un décalage qu'aucun test n'aurait attrapé.
 */
export async function getTurnover(period: { from: string; to: string }): Promise<TurnoverData> {
  const supabase = await createClient()
  // Mois entier côté début : le graphe raisonne par jour mais la lecture se fait par mois — une
  // borne au 15 couperait le mois en deux et ferait lire une chute d'activité.
  const from = `${period.from.slice(0, 7)}-01`

  const { data, error } = await supabase.rpc('turnover_report', { p_from: from, p_to: period.to })
  if (error) throw new Error(error.message)
  // `Returns: Json` → cast documenté vers le contrat local (pas `.overrideTypes`, inapplicable
  // sur l'union Json avec postgrest-js — cf. guidelines-data-loading §1).
  const rep = (data as TurnoverReport | null) ?? { by_day: [], headcount: 0, departures: [] }

  const days = rep.by_day.map((d) => ({
    jour: d.jour,
    entrees: Number(d.entrees) || 0,
    sorties: Number(d.sorties) || 0,
    effectif: Number(d.effectif) || 0,
  }))

  const departures = rep.departures.map((d) => ({
    name: d.name,
    reason: d.reason,
    leftAt: d.left_at,
    tenureDays: d.tenure_days === null ? null : Number(d.tenure_days),
  }))

  // Effectif MOYEN de la fenêtre — vraie moyenne jour par jour, le RPC donnant le point quotidien.
  const avgHeadcount = days.length ? days.reduce((s, d) => s + d.effectif, 0) / days.length : 0

  // Ancienneté moyenne sur les SEULS départs dont l'arrivée est connue. `mesurables.length` est le
  // dénominateur que la vue affiche à côté (« sur 7 départs sur 12 ») : une moyenne partielle
  // muette est un chiffre faux.
  const mesurables = departures.filter((d) => d.tenureDays !== null)
  const sumDays = mesurables.reduce((s, d) => s + (d.tenureDays ?? 0), 0)

  return {
    days,
    departures,
    entries: days.reduce((s, d) => s + d.entrees, 0),
    exits: departures.length,
    headcount: Number(rep.headcount) || 0,
    rate: turnoverRate(departures.length, avgHeadcount),
    tenureAvgDays: mesurables.length ? Math.round(sumDays / mesurables.length) : null,
    tenureKnown: mesurables.length,
  }
}
