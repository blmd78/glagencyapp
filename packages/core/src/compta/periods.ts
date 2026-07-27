import { addDays, daysBetween, frDayLong } from '../domain/dates'

/**
 * PÉRIODE DE PAIE — 14 jours du LUNDI au dimanche, jamais une quinzaine calendaire.
 *
 * Corrigé le 2026-07-27 après lecture de la feuille de paie de juillet du propriétaire : le
 * découpage 1–15 / 16–fin de mois était une erreur d'interprétation. La feuille aligne des
 * blocs de deux semaines pleines sur les lundis (S1 = 06→12/07, S2 = 13→19/07, le paiement du
 * bloc S2 additionnant les nets de S1 ET S2, donc couvrant 06/07 → 19/07), et l'onglet
 * « juillet » couvre en réalité 06/07 → 02/08 : il ne suit pas le mois.
 *
 * Conséquences : 26 périodes par an (pas 24), une période peut chevaucher deux mois voire deux
 * années, et elle ne se rattache donc plus à AUCUN mois — d'où la disparition du couple
 * `(month, period 1|2)` au profit du seul lundi de départ.
 */

/**
 * Lundi d'ancrage du découpage. Vérifié sur la feuille : le bloc S1 de juillet 2026 démarre le
 * lundi 06/07 ; les blocs voisins (20/07 et 22/06) sont à 14 jours d'intervalle exactement.
 * Toute période démarre donc un lundi `M` tel que `(M − 2026-07-06) mod 14 = 0`.
 */
export const PERIOD_ANCHOR = '2026-07-06'

/** Longueur d'une période, en jours. Fixe — c'est ce qui rend le découpage indépendant du mois. */
export const PERIOD_DAYS = 14

export interface PayPeriod {
  /** LUNDI de départ. Identifiant de la période (`compta_payments.period_start`, 0088). */
  start: string
  /** Dimanche de fin, `start + 13`. */
  end: string
  /** « du 6 au 19 juillet 2026 » — la façon dont le propriétaire nomme ses périodes. */
  label: string
}

/**
 * Libellé lisible d'une période. Trois formes, du plus fréquent au plus rare — le mois et
 * l'année ne sont répétés que lorsqu'ils changent, sinon la borne de gauche les porterait pour
 * rien (« du 6 juillet 2026 au 19 juillet 2026 » se lit deux fois moins vite que « du 6 au
 * 19 juillet 2026 »).
 */
function periodLabel(start: string, end: string): string {
  const [sy, sm] = [start.slice(0, 4), start.slice(5, 7)]
  const [ey, em] = [end.slice(0, 4), end.slice(5, 7)]
  // Même mois : « du 6 au 19 juillet 2026 ».
  if (sy === ey && sm === em) return `du ${Number(start.slice(8, 10))} au ${frDayLong(end)} ${ey}`
  // Deux mois, même année : « du 29 juin au 12 juillet 2026 ».
  if (sy === ey) return `du ${frDayLong(start)} au ${frDayLong(end)} ${ey}`
  // À cheval sur deux années : « du 28 décembre 2026 au 10 janvier 2027 ».
  return `du ${frDayLong(start)} ${sy} au ${frDayLong(end)} ${ey}`
}

/** `start` DOIT être un lundi aligné sur l'ancre — seul `periodOf` en fabrique. */
const make = (start: string): PayPeriod => {
  const end = addDays(start, PERIOD_DAYS - 1)
  return { start, end, label: periodLabel(start, end) }
}

/** Période contenant ce jour. */
export function periodOf(day: string): PayPeriod {
  // `Math.floor` et non une troncature : avant l'ancre l'écart est négatif, et `Math.trunc(-1/14)`
  // vaudrait 0 — le jour serait rangé dans la période SUIVANTE.
  const offset = Math.floor(daysBetween(PERIOD_ANCHOR, day) / PERIOD_DAYS) * PERIOD_DAYS
  return make(addDays(PERIOD_ANCHOR, offset))
}

/**
 * Les DEUX lundis de la période — toujours deux, par construction : `start` est un lundi et la
 * période dure exactement 14 jours. C'est `weekCount` de la formule (spec §4), et le nombre de
 * lignes de saisie hebdomadaire de la fiche.
 *
 * L'ancien découpage calendaire en rendait 2 ou 3 selon le mois ; cette variabilité disparaît.
 */
export function mondaysIn(p: PayPeriod): string[] {
  return [p.start, addDays(p.start, 7)]
}

/** Les 14 jours de la période, bornes incluses — les `covered_days` d'un paiement complet. */
export function daysIn(p: PayPeriod): string[] {
  return Array.from({ length: PERIOD_DAYS }, (_, i) => addDays(p.start, i))
}

/** Les `n` dernières périodes, la plus récente d'abord — alimente le sélecteur de période. */
export function recentPeriods(today: string, n = 12): PayPeriod[] {
  const out: PayPeriod[] = []
  let cur = periodOf(today)
  for (let i = 0; i < n; i++) {
    out.push(cur)
    cur = periodOf(addDays(cur.start, -1))
  }
  return out
}
