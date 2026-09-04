import { SLOT_KEYS, type SlotKey, held } from './slots'
import { groupIntoVacations, type MypulsSegment } from './vacations'

/**
 * Les 6 tuiles du haut du relevé MyPuls, au grain JOUR.
 *
 * DÉRIVÉES et non recopiées : les tuiles que MyPuls affiche décrivent la FENÊTRE demandée, pas
 * une journée. Or le run demande toujours trois jours pour n'en garder qu'un.
 *
 * LA JOURNÉE, ICI, EST CELLE DES CRÉNEAUX — 05:00 à 05:00 le lendemain, pas 00:00 à 23:59.
 * C'est la définition qu'emploie le tableau de couverture juste en dessous, et faire compter
 * la tuile en jour CIVIL les faisait diverger de −1 621 à +2 322 minutes sur la semaine
 * mesurée : une nuit de travail était comptée dans une journée par le tableau et dans l'autre
 * par la tuile. Deux chiffres pour la même chose au même écran, c'est un chiffre faux.
 *
 * Le temps et les messages viennent donc des lignes de COUVERTURE (bornées au créneau). Les
 * vacations et les modèles viennent des segments, qu'il revient à l'appelant de borner à la
 * même fenêtre.
 */

export interface MypulsCoverageRow {
  slot: SlotKey
  mypulsUserId: string
  coveragePct: number
  /** Minutes actives DANS le créneau — la grandeur qu'affiche le tableau. */
  activeMinutes: number
  messages: number
}

export interface MypulsDayKpi {
  chattersActifs: number
  vacations: number
  activeMinutes: number
  messages: number
  modelsWorked: number
  modelsTotal: number
  slotsHeld: number
  slotsTotal: number
}

export function dayKpi(
  segments: readonly MypulsSegment[],
  coverage: readonly MypulsCoverageRow[],
  opts: { breakMinutes: number; coverageThreshold: number; modelsTotal: number },
): MypulsDayKpi {
  const chatters = new Set<string>()
  let activeMinutes = 0
  let messages = 0

  // Temps et messages : depuis la COUVERTURE, pour coller exactement au tableau affiché.
  for (const c of coverage) {
    chatters.add(c.mypulsUserId)
    activeMinutes += c.activeMinutes
    messages += c.messages
  }

  // Modèles et vacations : depuis les segments, que l'appelant a bornés à la même fenêtre.
  const models = new Set<string>()
  for (const s of segments) for (const m of s.models) models.add(m.label)

  // « Créneau tenu » = au moins une personne au-dessus du seuil. C'est la lecture de MyPuls :
  // la tuile mesure la couverture du POSTE, pas la conformité des individus.
  const heldSlots = new Set<SlotKey>()
  for (const c of coverage) {
    if (held(c.coveragePct, opts.coverageThreshold)) heldSlots.add(c.slot)
  }

  return {
    chattersActifs: chatters.size,
    vacations: groupIntoVacations(segments, opts.breakMinutes).length,
    activeMinutes,
    messages,
    modelsWorked: models.size,
    modelsTotal: opts.modelsTotal,
    slotsHeld: heldSlots.size,
    slotsTotal: SLOT_KEYS.length,
  }
}
