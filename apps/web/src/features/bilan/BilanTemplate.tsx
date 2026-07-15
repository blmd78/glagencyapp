import { frDayShort as frDay } from '@glagency/core'
import { KpiGrid } from '@/components/kpi-card'
import { ModelBilanCard } from './components/model-bilan-card'
import { WeekSwitcher } from './components/week-switcher'
import type { BilanData } from './types'

/**
 * Template Bilan hebdomadaire (Server Component) : 4 KPI + une carte par modèle.
 * Le seul îlot client est `WeekSwitcher` (sélecteur de semaine) ; KPIs et cartes restent
 * rendus côté serveur, passés en `children`.
 */
export function BilanTemplate({ data }: { data: BilanData }) {
  const kpis = [
    {
      key: 'ca',
      label: 'CA total semaine',
      value: `${Math.round(data.totalCa).toLocaleString('fr-FR')} €`,
      deltaPct: null,
      trendLabel: '',
      // Total des scripts hors Pos 1 (tous modèles) — vide tant qu'aucune mesure.
      hint:
        data.totalHorsS1 != null && data.totalCa > 0
          ? `dont hors S1 : ${Math.round(data.totalHorsS1).toLocaleString('fr-FR')} € (${Math.round((100 * data.totalHorsS1) / data.totalCa)} %)`
          : '',
    },
    {
      key: 'subs',
      label: 'Nouveaux abonnés',
      value: data.totalNewSubs.toLocaleString('fr-FR'),
      deltaPct: null,
      trendLabel: '',
      hint: '',
    },
    {
      key: 'ltv',
      label: 'LTV moyenne',
      value: data.avgLtv != null ? `${data.avgLtv.toLocaleString('fr-FR')} €/sub` : '—',
      deltaPct: null,
      trendLabel: '',
      hint: 'hors comptes privés',
    },
    {
      key: 'ref',
      label: 'Période de référence',
      value: `${frDay(data.week.start)} au ${frDay(data.week.end)}`,
      deltaPct: null,
      trendLabel: '',
      hint: `S-1 : ${frDay(data.prevWeek.start)} au ${frDay(data.prevWeek.end)} · M-1 (S-4) : ${frDay(data.lastMonthWeek.start)} au ${frDay(data.lastMonthWeek.end)}`,
    },
  ]

  return (
    <WeekSwitcher
      weeks={data.weeks}
      current={data.week.start}
      header={
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bilan hebdomadaire</h1>
          <p className="text-sm text-muted-foreground">
            Par modèle · comparé à S-1 et au mois dernier (S-4)
          </p>
        </div>
      }
    >
      <KpiGrid kpis={kpis} />

      {data.models.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune donnée sur cette semaine.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.models.filter((m) => !m.excluded).map((m) => (
              <ModelBilanCard key={m.id} m={m} />
            ))}
          </div>
          {data.models.some((m) => m.excluded) && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Comptes privés — inclus dans le CA total, hors LTV moyenne
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.models.filter((m) => m.excluded).map((m) => (
                  <ModelBilanCard key={m.id} m={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </WeekSwitcher>
  )
}
