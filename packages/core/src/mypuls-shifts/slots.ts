/**
 * Les trois créneaux, en vocabulaire CRM.
 *
 * Trois vocabulaires cohabitent dans le projet et il faut les tenir droits :
 *   MyPuls          « Matin » / « Après-midi » / « Soirée »
 *   CRM             `matin` / `aprem` / `soir`      (`profiles.shift`, `police_entries.shift`)
 *   domaine tracker `matin` / `aprem` / `nuit`      (`tracking/shifts.ts`, l'agent Electron)
 *
 * On tranche sur le CRM : c'est lui qui compte au moment de pré-remplir une sanction, et une
 * conversion à cet endroit-là serait exactement l'endroit où se glisse une erreur qui coûte de
 * l'argent. Les HEURES, elles, sont identiques des deux côtés (05→13, 13→21, 21→05) — vérifié
 * sur la configuration MyPuls le 2026-09-01 : aucune conversion d'horaire n'est nécessaire.
 */

export type SlotKey = 'matin' | 'aprem' | 'soir'

export const SLOT_KEYS: readonly SlotKey[] = ['matin', 'aprem', 'soir']

export const SLOT_LABEL: Record<SlotKey, string> = {
  matin: 'Matin',
  aprem: 'Après-midi',
  soir: 'Soirée',
}

/** Heure de début canonique de chaque créneau, en heure murale Paris. */
export const SLOT_START_HOUR: Record<SlotKey, number> = { matin: 5, aprem: 13, soir: 21 }

const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

const BY_LABEL: Record<string, SlotKey> = {
  matin: 'matin',
  matinee: 'matin',
  apresmidi: 'aprem',
  aprem: 'aprem',
  soiree: 'soir',
  soir: 'soir',
  nuit: 'soir',
}

/** « 05:00 » → 5. */
export function hoursOf(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) throw new Error(`heure illisible : ${JSON.stringify(hhmm)}`)
  return Number(m[1]) + Number(m[2]) / 60
}

/**
 * Créneau MyPuls → clé CRM.
 *
 * Par le LIBELLÉ d'abord, par l'HEURE DE DÉBUT ensuite. Les deux, parce que les fenêtres MyPuls
 * sont saisies dans un formulaire : quelqu'un peut renommer « Soirée » en « Nuit » sans prévenir,
 * et un import qui casserait pour un renommage serait un import fragile. À l'inverse, se fier à la
 * seule heure ferait taire un vrai changement de découpage.
 *
 * Lève si aucun des deux ne conclut : mieux vaut un run en échec, visible, qu'un créneau rangé au
 * hasard dans une table dont on tire des sanctions.
 */
export function slotOf(label: string, startHHMM?: string): SlotKey {
  const byLabel = BY_LABEL[normalize(label)]
  if (byLabel) return byLabel
  if (startHHMM === undefined) {
    throw new Error(`créneau MyPuls inconnu : ${JSON.stringify(label)}`)
  }
  const h = hoursOf(startHHMM)
  let best: SlotKey | null = null
  let bestGap = Infinity
  for (const k of SLOT_KEYS) {
    // Distance circulaire sur 24 h : 23:30 est à 1 h 30 de 21:00, pas à 22 h 30.
    const raw = Math.abs(h - SLOT_START_HOUR[k])
    const gap = Math.min(raw, 24 - raw)
    if (gap < bestGap) {
      bestGap = gap
      best = k
    }
  }
  // Au-delà de 2 h d'écart, ce n'est plus le même découpage : on refuse de trancher.
  if (best === null || bestGap > 2) {
    throw new Error(`créneau MyPuls inconnu : ${JSON.stringify(label)} (début ${startHHMM})`)
  }
  return best
}

/** Le poste est tenu au-delà du seuil — la règle que MyPuls affiche lui-même (80 %). */
export const held = (coveragePct: number, threshold: number): boolean => coveragePct >= threshold
