import { addDays, endOfMonth, frMonthLong, mondayOf, startOfMonth } from '../domain/dates'
import { periodOf, PERIOD_DAYS, type PayPeriod } from './periods'

/**
 * LE MOIS CIVIL, et son rattachement au découpage en périodes de 14 jours.
 *
 * ── POURQUOI LE MOIS CIVIL, ET PAS AUTRE CHOSE ───────────────────────────────────────────────
 * La feuille du propriétaire porte un bloc de fin de mois : `Total Mois` (le CA du chatteur) et
 * `Nbre de handoff-🤝 / Mois`. Ces deux agrégats s'appellent « du mois » et se comparent d'un mois
 * sur l'autre — leur seule définition possible est le MOIS CIVIL (1er → dernier jour). Toute autre
 * borne (« les 2 dernières périodes », « 28 jours glissants ») produirait un « Total juillet » qui
 * ne serait pas le total de juillet, sans que rien ne le signale.
 *
 * Le découpage de paie, lui, ne s'aligne PAS sur les mois : une période de 14 jours calée sur les
 * lundis peut chevaucher deux mois (20/07 → 02/08) voire deux années (21/12 → 03/01). Les deux
 * grains coexistent donc, et la seule question est de savoir COMMENT on les relie.
 *
 * ── LA RÈGLE DE RATTACHEMENT : LE MOIS DU LUNDI DE DÉPART ────────────────────────────────────
 * `monthOfPeriod(p) = monthOf(p.start)`. C'est la règle DÉJÀ en place un cran plus bas dans la
 * feature — « une semaine est rattachée à la période de son LUNDI, et n'est jamais découpée »
 * (spec §3) — appliquée un cran plus haut : une période est rattachée au mois de son lundi de
 * départ, et n'est jamais découpée.
 *
 * SA PROPRIÉTÉ ESSENTIELLE EST UNE PARTITION : chaque période appartient à EXACTEMENT un mois,
 * et les mois se partagent toutes les périodes sans trou ni recouvrement. C'est ce qui rend la
 * garde anti-double-versement de la prime du mois possible (spec §5.9) : découper une période à
 * cheval entre deux mois, au prorata ou par majorité de jours, ferait qu'une même prime pourrait
 * être réclamée par deux mois — exactement ce qu'on cherche à interdire.
 *
 * Conséquence mesurable et voulue : un mois contient **2 ou 3 périodes** (juillet 2026 en a 2,
 * août 2026 en a 3 — le balayage de `months.test.ts` le vérifie sur deux ans).
 */

export interface PayMonth {
  /** « 2026-07 » — clé comparable, et celle qui indexe la garde anti-double-versement. */
  key: string
  /** Premier jour du mois (YYYY-MM-01). */
  start: string
  /** Dernier jour du mois. */
  end: string
  /** « juillet 2026 ». */
  label: string
}

/** Mois civil contenant ce jour. */
export function monthOf(day: string): PayMonth {
  return {
    key: day.slice(0, 7),
    start: startOfMonth(day),
    end: endOfMonth(day),
    label: frMonthLong(day),
  }
}

/**
 * Mois auquel une PÉRIODE de paie est rattachée = celui de son LUNDI DE DÉPART. Une période à
 * cheval (20/07 → 02/08) appartient donc entièrement à juillet ; celle du 21/12/2026 → 03/01/2027
 * appartient à décembre 2026. Jamais deux mois, jamais aucun.
 */
export function monthOfPeriod(p: PayPeriod): PayMonth {
  return monthOf(p.start)
}

/** La période SUIVANTE — `start` est aligné, +14 jours retombe donc sur le lundi suivant. */
const nextPeriod = (p: PayPeriod): PayPeriod => periodOf(addDays(p.start, PERIOD_DAYS))

/**
 * Les périodes de paie rattachées à ce mois, dans l'ordre. **2 ou 3**, jamais 0 ni 4.
 *
 * La période qui CONTIENT le 1er du mois peut avoir démarré le mois précédent (juillet 2026 : le
 * 1er tombe dans la période du 22/06) — elle appartient alors à ce mois-là et n'est pas retenue
 * ici. Sans ce saut, deux mois consécutifs se partageraient la même période et la prime du mois
 * pourrait être comptée deux fois.
 */
export function periodsOfMonth(m: PayMonth): PayPeriod[] {
  const out: PayPeriod[] = []
  let cur = periodOf(m.start)
  if (cur.start < m.start) cur = nextPeriod(cur)
  while (cur.start <= m.end) {
    out.push(cur)
    cur = nextPeriod(cur)
  }
  return out
}

/**
 * Les lundis QUI TOMBENT DANS le mois — 4 ou 5. Ils bornent la lecture de `compta_week_entries`
 * pour l'agrégat mensuel des handoffs.
 *
 * ⚠️ CE N'EST PAS l'union des lundis des périodes du mois, et la différence porte des chiffres.
 * Une semaine est rattachée au mois de son lundi (« jamais découpée », comme pour les périodes) :
 * la semaine du 29/06 au 05/07 compte pour JUIN en entier, celle du 31/08 au 06/09 pour AOÛT.
 * Les périodes, elles, ont leur propre découpage — le lundi 07/09 appartient à la période du
 * 31/08 (donc au mois d'août pour la prime setter) tout en étant un lundi de SEPTEMBRE (donc
 * compté dans les handoffs de septembre). Les deux agrégats répondent à deux questions
 * différentes, et l'écran le dit.
 */
export function mondaysOfMonth(m: PayMonth): string[] {
  const out: string[] = []
  let d = mondayOf(m.start)
  if (d < m.start) d = addDays(d, 7)
  while (d <= m.end) {
    out.push(d)
    d = addDays(d, 7)
  }
  return out
}
