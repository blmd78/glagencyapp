import { frDateTimeParis, frWeekdayDate } from '@glagency/core'
import type { ShiftRun } from '../types'

/**
 * L'état du relevé, affiché AVANT les chiffres.
 *
 * C'est le garde-fou du chantier : sans lui, « le scrape a échoué » et « personne n'a
 * travaillé » sont indiscernables, et cette confusion produirait des sanctions injustes. Un
 * jour sans run réussi n'affiche donc AUCUN zéro — il dit qu'il ne sait pas.
 *
 * AUCUN LIEN ICI, volontairement. Cette ligne a porté l'accès aux réglages : on atterrissait
 * donc sur un écran de maintenance en cliquant « 12 libellés MyPuls non rattachés », c'est-à-dire
 * en cliquant ce qu'on lit comme des NOMS. L'accès vit désormais en haut à droite de la page,
 * une fois, sous un libellé qui dit où il mène.
 */
export function RunNotice({
  run,
  available,
  day,
}: {
  run: ShiftRun | null
  available: boolean
  day: string
}) {
  if (!available) {
    return (
      <div
        role="status"
        className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        <p className="font-medium">Relevé indisponible pour le {frWeekdayDate(day)}.</p>
        <p className="mt-1">
          Aucune lecture MyPuls n’a abouti pour cette journée. Ce n’est pas une absence
          d’activité : les chiffres ne sont simplement pas connus.
        </p>
        <p className="mt-1">
          Le journal des relevés — « Réglages », en haut à droite — dit quelles nuits manquent et
          comment les rattraper.
        </p>
      </div>
    )
  }

  if (!run) return null

  return (
    <p className="text-sm text-muted-foreground">
      Relevé MyPuls du {frDateTimeParis(run.ranAt)} · seuil d’inactivité {run.idleMinutes} min ·
      poste tenu au-delà de {run.coverageThreshold} %
      {run.unmatched > 0 && (
        <>
          {' · '}
          <span className="text-amber-700 dark:text-amber-400">
            {run.unmatched} libellé(s) MyPuls non rattaché(s)
          </span>
        </>
      )}
    </p>
  )
}
