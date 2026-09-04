import { frDateTimeParis, frWeekdayDate } from '@glagency/core'
import { int } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'
import type { ShiftRunRow } from '../types'

/**
 * Le journal des runs — le garde-fou du chantier rendu visible.
 *
 * Sur le relevé, un jour sans run réussi affiche « relevé indisponible ». Mais il faut venir
 * ici pour savoir qu'il y en a douze, et depuis quand. Chaque ligne porte aussi les réglages
 * qui ont servi À CE RUN : sans eux, un changement d'`idle` se lit comme un décrochage
 * inexplicable dans les chiffres.
 */
export function RunJournal({ runs, missingDays }: { runs: ShiftRunRow[]; missingDays: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      {missingDays.length > 0 && (
        <div
          role="status"
          className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <p className="font-medium">
            {missingDays.length} jour(s) sans relevé sur la période.
          </p>
          <p className="mt-1">
            {missingDays.slice(0, 8).map(frWeekdayDate).join(' · ')}
            {missingDays.length > 8 && ` · et ${missingDays.length - 8} autre(s)`}
          </p>
          <p className="mt-1">
            Ces journées ne sont pas vides, elles sont inconnues. Pour les rattraper :{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-900">
              pnpm --filter @glagency/ingestion shifts {missingDays[0]}{' '}
              {missingDays[missingDays.length - 1]}
            </code>
          </p>
        </div>
      )}

      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun relevé enregistré.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-4 font-normal">Lancé le</th>
                <th className="py-1 pr-4 font-normal">Jours lus</th>
                <th className="py-1 pr-4 font-normal">État</th>
                <th className="py-1 pr-4 text-right font-normal">Segments</th>
                <th className="py-1 pr-4 text-right font-normal">Couverture</th>
                <th className="py-1 pr-4 text-right font-normal">Non rattachés</th>
                <th className="py-1 font-normal">Réglages du run</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">{frDateTimeParis(r.ranAt)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                    {r.dayFrom === r.dayTo ? r.dayFrom : `${r.dayFrom} → ${r.dayTo}`}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge
                      className={r.status === 'ok' ? STATUS_COLORS.positive : STATUS_COLORS.danger}
                    >
                      {r.status === 'ok' ? 'réussi' : 'échec'}
                    </Badge>
                    {r.error && (
                      // Le message d'erreur EN CLAIR : un parseur qui casse doit être
                      // diagnosticable sans ouvrir Sentry.
                      <p className="mt-1 max-w-md text-xs break-words text-red-700 dark:text-red-400">
                        {r.error}
                      </p>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{int(r.segments)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{int(r.coverageRows)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {r.unmatchedCount > 0 ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        {int(r.unmatchedCount)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 whitespace-nowrap text-muted-foreground">
                    pause {r.idleMinutes} min · seuil {r.coverageThreshold} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
