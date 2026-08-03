import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DEPARTURE_LABEL, frDateNumeric, type DepartureReason } from '@glagency/core'
import { KpiGrid } from '@/components/kpi-card'
import { TurnoverChart } from './turnover-chart'
import type { TurnoverData } from '../types'

/**
 * Onglet TURNOVER — Server Component, aucun état : tout est agrégé par `get-turnover.ts`.
 *
 * Graphe en barres CSS et non en librairie : deux séries sur douze points au maximum, une grille
 * de `div` le fait aussi bien et ne coûte aucun kilo-octet de plus au bundle.
 */
export function TurnoverView({ data }: { data: TurnoverData }) {
  const kpis = [
    {
      key: 'headcount',
      label: 'Effectif actuel',
      value: String(data.headcount),
      deltaPct: null,
      trendLabel: 'Membres en poste',
      hint: 'hors départs enregistrés',
      info: 'Membres dont aucune date de sortie n’est enregistrée, toutes fonctions confondues.',
    },
    {
      key: 'entries',
      label: 'Arrivées',
      value: String(data.entries),
      deltaPct: null,
      trendLabel: 'Sur la période',
      hint: 'date d’arrivée saisie',
      info: 'Comptées sur la date d’arrivée saisie — un membre sans date saisie n’y figure pas.',
    },
    {
      key: 'exits',
      label: 'Départs',
      value: String(data.exits),
      deltaPct: null,
      trendLabel: 'Sur la période',
      hint: 'date de sortie enregistrée',
      info: 'Comptés sur la date de sortie. Fiable dès le premier départ enregistré.',
    },
    {
      key: 'rate',
      label: 'Taux de turnover',
      value: data.rate === null ? '—' : `${Math.round(data.rate * 100)} %`,
      deltaPct: null,
      trendLabel: 'Départs ÷ effectif moyen',
      hint: data.rate === null ? 'effectif inconnu' : `${data.exits} départ(s)`,
      info: 'Départs de la période rapportés à l’effectif moyen de fin de mois.',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <KpiGrid kpis={kpis} />

      <TurnoverChart data={data} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Départs de la période</CardTitle>
            <CardDescription>Qui est parti, et pourquoi.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.departures.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun départ sur la période.</p>
            ) : (
              <ul className="flex flex-col">
                {data.departures.map((d) => (
                  <li
                    key={`${d.name}-${d.leftAt}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b py-2 last:border-0"
                  >
                    <span className="font-medium">{d.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {DEPARTURE_LABEL[d.reason as DepartureReason] ?? d.reason}
                    </span>
                    <span className="w-full text-xs tabular-nums text-muted-foreground">
                      {frDateNumeric(d.leftAt)}
                      {/* Durée omise plutôt qu'affichée à zéro quand l'arrivée n'est pas saisie :
                          « 0 jour » se lirait comme un départ le jour même. */}
                      {d.tenureDays !== null && ` · ${d.tenureDays} jours`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Temps entre l’arrivée et le départ</CardTitle>
            <CardDescription>Combien de temps les chatteurs restent, en moyenne.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.tenureAvgDays === null ? (
              <p className="text-sm text-muted-foreground">
                Pas encore mesurable : aucun des départs de la période ne porte de date
                d’arrivée. Renseigne-la sur les fiches pour que ce chiffre se remplisse.
              </p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.tenureAvgDays} <span className="text-base font-normal">jours</span>
                </p>
                {/* LE DÉNOMINATEUR EST AFFICHÉ, TOUJOURS. Cette moyenne ne porte que sur les
                    départs dont l'arrivée est connue ; la donner seule laisserait croire
                    qu'elle couvre tout le monde. */}
                <p className="mt-1 text-sm text-muted-foreground">
                  sur {data.tenureKnown} départ{data.tenureKnown > 1 ? 's' : ''} sur {data.exits}
                  {data.tenureKnown < data.exits && ' — les autres n’ont pas de date d’arrivée'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
