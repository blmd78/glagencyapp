import { SLOT_LABEL, frWeekdayDate } from '@glagency/core'
import type { SlotWindow } from '../types'

/**
 * Les fenêtres de créneau telles qu'elles ont RÉELLEMENT servi sur la période.
 *
 * On ne les relit pas chez MyPuls : elles s'y saisissent dans un formulaire, se modifient à
 * tout moment et rien n'en garde de version — la valeur d'aujourd'hui ne dit rien de celle qui
 * a mesuré le 12 juillet. Ce que montre ce bloc, ce sont les bornes figées sur chaque ligne de
 * couverture au moment du run.
 *
 * DEUX lignes pour un même créneau = quelqu'un a déplacé la fenêtre chez MyPuls. C'est
 * exactement ce qu'on vient chercher ici quand une couverture décroche sans raison.
 */
export function SlotWindows({ windows }: { windows: SlotWindow[] }) {
  if (windows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune fenêtre observée sur la période — aucun relevé n’a abouti.
      </p>
    )
  }

  const moved = new Set(
    windows.filter((w, _, all) => all.filter((o) => o.slot === w.slot).length > 1).map((w) => w.slot),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-4 font-normal">Créneau</th>
              <th className="py-1 pr-4 font-normal">Fenêtre (heure de Paris)</th>
              <th className="py-1 pr-4 font-normal">Appliquée</th>
              <th className="py-1 text-right font-normal">Jours</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => (
              <tr key={`${w.slot}-${w.startsAt}-${w.firstDay}`} className="border-t">
                <td className="py-2 pr-4 font-medium">{SLOT_LABEL[w.slot] ?? w.slot}</td>
                <td className="py-2 pr-4 tabular-nums">
                  {w.startsAt} → {w.endsAt}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {w.firstDay === w.lastDay
                    ? frWeekdayDate(w.firstDay)
                    : `${frWeekdayDate(w.firstDay)} → ${frWeekdayDate(w.lastDay)}`}
                </td>
                <td className="py-2 text-right tabular-nums">{w.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {moved.size > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {moved.size === 1 ? 'Un créneau a changé' : `${moved.size} créneaux ont changé`} de
          fenêtre pendant la période. Les couvertures d’avant et d’après ne se comparent pas
          directement : elles ne portent pas sur la même durée.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        La Soirée se termine à 05:00 le lendemain — c’est pourquoi le relevé de la veille n’est
        lu qu’après 05:30, et pourquoi une lecture plus tôt afficherait toute l’équipe du soir
        sous le seuil.
      </p>
    </div>
  )
}
