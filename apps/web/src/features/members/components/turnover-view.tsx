import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { frDateNumeric } from '@glagency/core'
import { KpiGrid } from '@/components/kpi-card'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'
import { cn } from '@/lib/utils'
import { DEPARTURE_LABEL, type DepartureReason } from '@glagency/core'
import type { TurnoverData } from '../types'

const MOIS_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

/** '2026-08' → 'août 26'. */
const moisLabel = (iso: string) => {
  const [y, m] = iso.split('-')
  return `${MOIS_FR[Number(m) - 1]} ${y.slice(2)}`
}

/**
 * Onglet TURNOVER — Server Component, aucun état : tout est agrégé par `get-turnover.ts`.
 *
 * Graphe en barres CSS et non en librairie : deux séries sur douze points au maximum, une grille
 * de `div` le fait aussi bien et ne coûte aucun kilo-octet de plus au bundle.
 */
export function TurnoverView({ data }: { data: TurnoverData }) {
  const max = Math.max(1, ...data.months.map((m) => Math.max(m.entrees, m.sorties)))
  const kpis = [
    {
      key: 'headcount',
      label: 'Effectif actuel',
      value: String(data.headcount),
      deltaPct: null,
      trendLabel: '',
      hint: 'membres en poste',
      info: 'Membres dont aucune date de sortie n’est enregistrée.',
    },
    {
      key: 'entries',
      label: 'Arrivées',
      value: String(data.entries),
      deltaPct: null,
      trendLabel: '',
      hint: 'sur la période',
      info: 'Comptées sur la date d’arrivée saisie — un membre sans date saisie n’y figure pas.',
    },
    {
      key: 'exits',
      label: 'Départs',
      value: String(data.exits),
      deltaPct: null,
      trendLabel: '',
      hint: 'sur la période',
      info: 'Comptés sur la date de sortie. Fiable dès le premier départ enregistré.',
    },
    {
      key: 'rate',
      label: 'Taux de turnover',
      value: data.rate === null ? '—' : `${Math.round(data.rate * 100)} %`,
      deltaPct: null,
      trendLabel: '',
      hint: 'départs ÷ effectif moyen',
      info: 'Départs de la période rapportés à l’effectif moyen de fin de mois.',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* CE BANDEAU N'EST PAS DÉCORATIF. Sans lui, les mois d'avant le peuplement du CRM se
          lisent comme un creux d'activité, et l'ancienneté moyenne comme une mesure complète.
          Un chiffre dont on ignore la couverture vaut moins que pas de chiffre. */}
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Période analysée : du {frDateNumeric(data.from)} au {frDateNumeric(data.to)} — elle suit le sélecteur de
        dates en haut de page. Les <strong className="font-medium">arrivées</strong> ne sont
        comptées que pour les membres dont la date a été saisie sur leur fiche ; les{' '}
        <strong className="font-medium">départs</strong>, eux, sont complets depuis leur premier
        enregistrement.
      </p>

      <KpiGrid kpis={kpis} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Arrivées et départs par mois</CardTitle>
          <CardDescription>
            Effectif de fin de mois en gris sous chaque barre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.months.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun mouvement sur la période.</p>
          ) : (
            <div className="flex items-end gap-3 overflow-x-auto pb-2">
              {data.months.map((m) => (
                <div key={m.mois} className="flex min-w-14 flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-32 w-full items-end justify-center gap-1">
                    <div
                      className="w-1/3 rounded-t bg-blue-500/80"
                      style={{ height: `${(m.entrees / max) * 100}%` }}
                      title={`${m.entrees} arrivée(s) en ${moisLabel(m.mois)}`}
                    />
                    <div
                      className="w-1/3 rounded-t bg-amber-500/80"
                      style={{ height: `${(m.sorties / max) * 100}%` }}
                      title={`${m.sorties} départ(s) en ${moisLabel(m.mois)}`}
                    />
                  </div>
                  <span className="text-xs font-medium">{moisLabel(m.mois)}</span>
                  <span className="text-xs text-muted-foreground">{m.effectif}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-blue-500/80" /> Arrivées
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-amber-500/80" /> Départs
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Motifs de départ</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.reasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun départ enregistré.</p>
            ) : (
              data.reasons.map((r) => (
                <Badge key={r.reason} className={cn('gap-1.5', STATUS_COLORS.neutral)}>
                  {DEPARTURE_LABEL[r.reason as DepartureReason] ?? r.reason}
                  <span className="font-semibold">{r.n}</span>
                </Badge>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ancienneté moyenne à la sortie</CardTitle>
          </CardHeader>
          <CardContent>
            {data.tenureAvgDays === null ? (
              <p className="text-sm text-muted-foreground">
                Pas encore mesurable : aucun départ ne porte de date d’arrivée.
              </p>
            ) : (
              <>
                <p className="text-2xl font-semibold">{data.tenureAvgDays} jours</p>
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
