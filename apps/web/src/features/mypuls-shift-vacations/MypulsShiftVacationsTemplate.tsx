import { fmtDuration, frWeekdayDate } from '@glagency/core'
import { int } from '@/lib/format'
import { VacationFilters } from './components/vacation-filters'
import { VacationTable } from './components/vacation-table'
import type { VacationsPage } from './types'

/**
 * Détail des vacations — Server Component qui ne fetch RIEN : `page.tsx` lui passe la donnée.
 *
 * C'est la vue d'ENQUÊTE : celle qu'on ouvre quand un chiffre du Relevé surprend. D'où le grain
 * (la vacation, pas le créneau) et les filtres libres, là où le Relevé impose un jour.
 */
export function MypulsShiftVacationsTemplate({ data }: { data: VacationsPage }) {
  return (
    <div className="flex flex-col gap-6">
      <VacationFilters data={data} />

      {!data.available ? (
        <div
          role="status"
          className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <p className="font-medium">
            Aucun relevé n’a abouti entre le {frWeekdayDate(data.from)} et le{' '}
            {frWeekdayDate(data.to)}.
          </p>
          <p className="mt-1">
            Ce n’est pas une absence de travail : ces journées ne sont simplement pas connues.
          </p>
        </div>
      ) : (
        <>
          {data.clamped && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {/* Le plafond est la contrepartie du filtre, pas une limite arbitraire : une
                  journée d’agence pèse ~2 600 segments, un chatter une vingtaine. */}
              {data.profileId
                ? `Période ramenée à ${data.maxDays} jours — au-delà, c’est un export, pas un écran.`
                : `Période ramenée au ${frWeekdayDate(data.to)} : sans chatter choisi, une seule journée d’agence pèse déjà ~2 600 segments. Choisis quelqu’un pour remonter jusqu’à un mois.`}
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            {int(data.totals.vacations)} vacation{data.totals.vacations > 1 ? 's' : ''} ·{' '}
            {fmtDuration(data.totals.activeMinutes)} de temps actif ·{' '}
            {int(data.totals.messages)} messages · {data.daysRead} jour
            {data.daysRead > 1 ? 's' : ''} lu{data.daysRead > 1 ? 's' : ''}
          </p>

          <VacationTable rows={data.rows} />
        </>
      )}
    </div>
  )
}
