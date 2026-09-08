import { addDays, todayParis } from '../domain/dates'
import { parisDay, parisOffsetMs, parisWallUtcMs } from './time'

// ⚠️ Les colonnes `shift_key` de la base acceptent aussi `'jour'` (la vue journalière de
// l'incrément 4). Ce type ne couvre que les 3 shifts : la ligne journalière exigera un élargissement.
export type ShiftKey = 'matin' | 'aprem' | 'nuit'

export interface Shift {
  key: ShiftKey
  label: string
  startH: number
  endH: number
}

/** 3 shifts de 8 h qui couvrent 24 h. Heures en heure locale Paris. */
export const SHIFTS: readonly Shift[] = [
  { key: 'matin', label: 'Matin', startH: 5, endH: 13 },
  { key: 'aprem', label: 'Après-midi', startH: 13, endH: 21 },
  { key: 'nuit', label: 'Nuit', startH: 21, endH: 5 }, // franchit minuit
]

export const shiftByKey = (key: string): Shift | undefined => SHIFTS.find((s) => s.key === key)

/** Les 3 fins de shift : 13 h, 21 h, 05 h. */
export const BOUNDARIES: readonly number[] = SHIFTS.map((s) => s.endH)

export interface ShiftWindow {
  start: number
  end: number
  /** Date Paris de la FIN — c'est elle qui sert à requêter les événements. */
  date: string
  label: string
  range: string
}

/**
 * Fenêtre du shift qui vient de se TERMINER à `nowMs`.
 * Ex. à 13h05 pour « matin » → [aujourd'hui 05 h, aujourd'hui 13 h].
 *     à 05h05 pour « nuit »  → [hier 21 h, aujourd'hui 05 h].
 * Correct les jours de bascule d'heure en passant par l'heure murale explicite.
 */
export function shiftWindow(shift: Shift, nowMs: number = Date.now()): ShiftWindow {
  let endDay = parisDay(new Date(nowMs).toISOString())
  // Si la fin de ce shift n'est pas encore passée aujourd'hui, c'est celui d'hier qui a fini.
  if (parisWallUtcMs(endDay, shift.endH) > nowMs) endDay = addDays(endDay, -1)
  return shiftWindowOn(shift, endDay)
}

/**
 * Fenêtre d'un shift dont la FIN tombe le jour `endDay` (`YYYY-MM-DD`, heure de Paris) — c'est la
 * clé d'URL du board, qui laisse choisir une date passée.
 *
 * Le `start` ne se DÉRIVE PAS du `end` par une durée fixe : les deux nuits de bascule d'heure
 * durent 7 h ou 9 h, pas 8. On repasse donc par l'heure murale du jour de départ — la veille
 * quand le shift franchit minuit (cas `nuit`).
 */
export function shiftWindowOn(shift: Shift, endDay: string): ShiftWindow {
  const end = parisWallUtcMs(endDay, shift.endH)
  const startDay = shift.startH > shift.endH ? addDays(endDay, -1) : endDay
  const start = parisWallUtcMs(startDay, shift.startH)
  return {
    start,
    end,
    date: endDay,
    label: shift.label,
    range: `${String(shift.startH).padStart(2, '0')}h → ${String(shift.endH).padStart(2, '0')}h`,
  }
}

/**
 * LA JOURNÉE DE SERVICE EN COURS — celle qu'on vient de travailler, pas celle qu'affiche le
 * calendrier.
 *
 * Le service de nuit finit à 05:00 (`SHIFTS.nuit.endH`, la même borne que le relevé MyPuls, dont
 * le créneau du soir court jusqu'à 05:00 Paris). Tant qu'il n'est pas fini, la journée de travail
 * en cours est celle de la VEILLE civile : un encadrant qui range son poste à 02:52 termine la
 * journée d'hier.
 *
 * D'où ça vient : le 2026-09-08, un manager a signalé que son bilan écrit après minuit était
 * compté sur le lendemain. Le choix du jour existait déjà (2026-09-03) mais la valeur PROPOSÉE
 * restait le jour civil — six débriefs sur huit écrits entre 0 h et 7 h avaient été recalés à la
 * main, deux ne l'avaient pas été. Cette fonction ne décide RIEN : elle ne sert qu'à proposer, la
 * date écrite reste celle que l'encadrant choisit (décision de Benoit du 2026-09-03, « laisse-les
 * mettre comme ils veulent, sans les embêter »).
 *
 * L'heure vient de `parisOffsetMs` (mémoïsé à l'heure) et non d'un `Intl` reconstruit : cette
 * fonction est appelée à chaque rendu de la To-Do.
 */
export function serviceDayParis(now: Date = new Date()): string {
  const nightEnd = (shiftByKey('nuit') as Shift).endH
  const parisHour = new Date(now.getTime() + parisOffsetMs(now)).getUTCHours()
  const civil = todayParis(now)
  return parisHour < nightEnd ? addDays(civil, -1) : civil
}

/** Le shift en cours à `nowMs` (heure de Paris). */
export function currentShift(nowMs: number = Date.now()): Shift {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
      .format(new Date(nowMs)),
  ) % 24
  // Index littéraux : `noUncheckedIndexedAccess` ne déduit pas que SHIFTS a 3 entrées.
  if (hour >= 5 && hour < 13) return SHIFTS[0] as Shift
  if (hour >= 13 && hour < 21) return SHIFTS[1] as Shift
  return SHIFTS[2] as Shift
}
