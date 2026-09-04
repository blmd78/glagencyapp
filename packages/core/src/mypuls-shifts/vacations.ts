import { parisWallUtcMs } from '../tracking/time'
import { hoursOf } from './slots'

/**
 * Regroupement des segments MyPuls en VACATIONS.
 *
 * MyPuls fait ce calcul côté serveur (paramètre `break`), mais on l'ingère au grain FIN
 * (`break = idle`) : c'est le grain qui porte la timeline, et le regroupement s'en déduit alors
 * que l'inverse est impossible. Mesuré le 2026-08-29 sur 137 chatteurs : `break=3` et `break=60`
 * donnent EXACTEMENT le même temps actif, seul le découpage change. Regrouper nous-mêmes ne
 * déforme donc aucune mesure — c'est une opération d'affichage.
 */

export interface MypulsSegmentModel {
  label: string
  messages: number
}

export interface MypulsSegment {
  mypulsUserId: string
  /** Jour Paris de début, ISO. */
  day: string
  /** `HH:MM` mural Paris. */
  startTime: string
  /** Jour Paris de fin, ISO — différent de `day` quand le segment franchit minuit. */
  endDay: string
  endTime: string
  activeMinutes: number
  messages: number
  models: MypulsSegmentModel[]
}

export interface MypulsVacation {
  mypulsUserId: string
  /** Jour Paris de début de la vacation. */
  day: string
  startedAtMs: number
  endedAtMs: number
  /** Somme du temps actif des segments — PAS la durée bornes à bornes, qui inclut les creux. */
  activeMinutes: number
  messages: number
  /** Modèles fusionnés sur toute la vacation, du plus bavard au moins bavard. */
  models: MypulsSegmentModel[]
  segments: number
}

/**
 * Instants UTC d'un segment. On passe par `parisWallUtcMs`, dont la double passe gère les deux
 * jours de bascule d'heure : une nuit de changement d'heure décalerait sinon toute une vacation
 * d'un créneau, et donc son verdict.
 */
export function segmentBounds(s: MypulsSegment): { startMs: number; endMs: number } {
  return {
    startMs: parisWallUtcMs(s.day, hoursOf(s.startTime)),
    endMs: parisWallUtcMs(s.endDay, hoursOf(s.endTime)),
  }
}

function mergeModels(into: MypulsSegmentModel[], from: MypulsSegmentModel[]): void {
  for (const m of from) {
    const found = into.find((x) => x.label === m.label)
    if (found) found.messages += m.messages
    else into.push({ label: m.label, messages: m.messages })
  }
}

/**
 * Segment dont les bornes sont DÉJÀ des instants.
 *
 * C'est la forme que rend la base (`timestamptz`). Repasser par l'heure murale pour la
 * reconvertir serait à la fois plus lent et moins juste : la nuit du retour à l'heure d'hiver,
 * une heure murale désigne deux instants, et l'aller-retour en choisit un au hasard.
 */
export interface MypulsSegmentAt {
  mypulsUserId: string
  day: string
  startedAtMs: number
  endedAtMs: number
  activeMinutes: number
  messages: number
  models: MypulsSegmentModel[]
}

/**
 * Une nouvelle vacation démarre dès que le trou avec le segment précédent atteint `breakMinutes`.
 * Les segments d'une même personne sont traités dans l'ordre chronologique, indépendamment de
 * l'ordre du CSV.
 */
export function groupIntoVacations(
  segments: readonly MypulsSegment[],
  breakMinutes: number,
): MypulsVacation[] {
  return groupVacationsAt(
    segments.map((s) => {
      const b = segmentBounds(s)
      return {
        mypulsUserId: s.mypulsUserId,
        day: s.day,
        startedAtMs: b.startMs,
        endedAtMs: b.endMs,
        activeMinutes: s.activeMinutes,
        messages: s.messages,
        models: s.models,
      }
    }),
    breakMinutes,
  )
}

/** Même regroupement, à partir de bornes déjà résolues en instants. */
export function groupVacationsAt(
  segments: readonly MypulsSegmentAt[],
  breakMinutes: number,
): MypulsVacation[] {
  const byUser = new Map<string, { seg: MypulsSegmentAt; startMs: number; endMs: number }[]>()
  for (const s of segments) {
    const list = byUser.get(s.mypulsUserId)
    const entry = { seg: s, startMs: s.startedAtMs, endMs: s.endedAtMs }
    if (list) list.push(entry)
    else byUser.set(s.mypulsUserId, [entry])
  }

  const out: MypulsVacation[] = []
  const gapMs = breakMinutes * 60_000

  for (const [mypulsUserId, list] of byUser) {
    list.sort((a, b) => a.startMs - b.startMs)
    let cur: MypulsVacation | null = null
    let curEndMs = 0

    for (const { seg, startMs, endMs } of list) {
      if (cur === null || startMs - curEndMs >= gapMs) {
        cur = {
          mypulsUserId,
          day: seg.day,
          startedAtMs: startMs,
          endedAtMs: endMs,
          activeMinutes: seg.activeMinutes,
          messages: seg.messages,
          models: seg.models.map((m) => ({ ...m })),
          segments: 1,
        }
        out.push(cur)
      } else {
        cur.activeMinutes += seg.activeMinutes
        cur.messages += seg.messages
        cur.segments += 1
        mergeModels(cur.models, seg.models)
      }
      // `Math.max` et non une affectation sèche : deux segments peuvent se chevaucher quand un
      // chatteur travaille sur deux modèles en parallèle, et la fin d'une vacation est la plus
      // tardive de ses fins, pas celle du dernier segment commencé.
      cur.endedAtMs = Math.max(cur.endedAtMs, endMs)
      curEndMs = cur.endedAtMs
    }
  }

  for (const v of out) v.models.sort((a, b) => b.messages - a.messages || a.label.localeCompare(b.label))
  return out.sort((a, b) => a.startedAtMs - b.startedAtMs)
}
