import { addDays, mondayOf } from '../domain/dates'

/** Roue des récompenses (transposition de GLA) — règles PURES, testées, partagées par apps/web. */
export type WheelSector = { label: string; weight: number; lose: boolean }
export type WheelPrize = { label: string; weight: number; amountEur: number | null }


// (Les défauts GLA — roue Cadeau 80 / Raté 20 et les 5 lots du coffre — vivent en base : la seed de
// la migration 0122 écrit la ligne unique `training_wheel_config`, que l'admin édite ensuite. Les
// recopier ici en littéraux TS ne servait rien et faisait une seconde source de vérité.)

/**
 * Tirage pondéré : `rand(n)` doit rendre un entier dans [0, n) (côté serveur : crypto.randomInt).
 * Les poids ≤ 0 sont ignorés ; somme nulle → erreur (config invalide).
 */
export function pickWeighted<T extends { weight: number }>(items: T[], rand: (maxExclusive: number) => number): { item: T; index: number } {
  const total = items.reduce((n, it) => n + Math.max(0, it.weight), 0)
  if (total <= 0) throw new Error('tirage impossible : aucun poids > 0')
  let r = rand(total)
  for (let i = 0; i < items.length; i++) {
    // Bornes garanties par la boucle (`i < items.length`) — `noUncheckedIndexedAccess` ne le
    // déduit pas seul.
    const it = items[i] as T
    const w = Math.max(0, it.weight)
    if (w === 0) continue
    if (r < w) return { item: it, index: i }
    r -= w
  }
  // Filet de sécurité (arrondi flottant côté appelant) : `total > 0` garantit `items.length ≥ 1`.
  const last = items.length - 1
  return { item: items[last] as T, index: last }
}

/** Lundi de la DERNIÈRE semaine complète (jour Paris 'YYYY-MM-DD' en entrée). */
export const lastCompletedWeek = (today: string): string => addDays(mondayOf(today), -7)

/** « semaine du 10/08 » */
export const wheelWeekLabel = (monday: string): string => `semaine du ${monday.slice(8, 10)}/${monday.slice(5, 7)}`
