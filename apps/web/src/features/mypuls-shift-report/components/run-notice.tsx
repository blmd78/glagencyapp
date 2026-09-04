import { frDateTimeParis, frWeekdayDate } from '@glagency/core'
import type { ShiftRun } from '../types'

/**
 * L'état du relevé sur la période, affiché AVANT les chiffres.
 *
 * C'est le garde-fou du chantier : sans lui, « le scrape a échoué » et « personne n'a
 * travaillé » sont indiscernables, et cette confusion produirait des sanctions injustes. Une
 * période sans aucun relevé n'affiche donc AUCUN zéro — elle dit qu'elle ne sait pas.
 *
 * Sur une PÉRIODE il faut en plus nommer les nuits manquantes : sur un jour unique, l'absence de
 * relevé était évidente (l'écran entier disait « indisponible »), alors qu'un trou de trois
 * nuits au milieu d'un mois se lit comme trois jours de repos.
 *
 * AUCUN LIEN ICI, volontairement : cette ligne a porté l'accès aux réglages, si bien qu'on
 * atterrissait sur un écran de maintenance en cliquant ce qu'on lit comme des NOMS. L'accès vit
 * en haut à droite de la page, une fois, sous un libellé qui dit où il mène.
 */
export function RunNotice({
  run,
  available,
  periodLabel,
  missingDays,
  clampedToYesterday,
}: {
  run: ShiftRun | null
  available: boolean
  periodLabel: string
  missingDays: string[]
  /** La période demandée allait jusqu'à aujourd'hui, qui n'est jamais relevé. */
  clampedToYesterday: boolean
}) {
  if (!available) {
    return (
      <div
        role="status"
        className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        <p className="font-medium">Relevé indisponible sur {periodLabel}.</p>
        <p className="mt-1">
          Aucune lecture MyPuls n’a abouti sur cette période. Ce n’est pas une absence
          d’activité : les chiffres ne sont simplement pas connus. Le journal des relevés —
          « Réglages », en haut à droite — dit quelles nuits manquent et comment les rattraper.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {run && (
        <p className="text-sm text-muted-foreground">
          Dernier relevé MyPuls du {frDateTimeParis(run.ranAt)} · seuil d’inactivité{' '}
          {run.idleMinutes} min · poste tenu au-delà de {run.coverageThreshold} %
          {run.unmatched > 0 && (
            <>
              {' · '}
              <span className="text-amber-700 dark:text-amber-400">
                {run.unmatched} libellé(s) MyPuls non rattaché(s)
              </span>
            </>
          )}
        </p>
      )}

      {clampedToYesterday && (
        <p className="text-xs text-muted-foreground">
          La journée d’aujourd’hui n’est pas relevée : le créneau du soir court jusqu’à 05 h
          demain, et le lire maintenant donnerait une couverture tronquée. La période s’arrête
          donc à hier.
        </p>
      )}

      {missingDays.length > 0 && (
        <p
          role="status"
          className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <span className="font-medium">
            {missingDays.length} jour{missingDays.length > 1 ? 's' : ''} sans relevé
          </span>{' '}
          sur la période : {missingDays.slice(0, 6).map(frWeekdayDate).join(' · ')}
          {missingDays.length > 6 && ` · et ${missingDays.length - 6} autre(s)`}. Ces journées ne
          sont pas vides, elles sont inconnues — elles ne comptent dans aucun chiffre ci-dessous.
        </p>
      )}
    </div>
  )
}
