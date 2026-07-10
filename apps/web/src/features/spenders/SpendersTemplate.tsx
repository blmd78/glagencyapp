import { KpiCard, type Kpi } from '@/components/kpi-card'
import { eur } from '@/lib/format'
import { SpendersView, type SpendersViewKind } from './components/spenders-view'
import { isARelancer, R_ALERTE, type SpendersData } from './types'

const META: Record<SpendersViewKind, { title: string; sub: (n: number) => string }> = {
  liste: { title: 'Spenders', sub: (n) => `${n} fan(s) tracké(s)` },
  tracker: { title: 'À relancer', sub: (n) => `${n} spender(s) à cocher aujourd’hui (R < ${R_ALERTE})` },
  alertes: { title: `Alertes R${R_ALERTE}`, sub: (n) => `${n} spender(s) en fin de cycle — à archiver` },
  archive: { title: 'Archive', sub: (n) => `${n} spender(s) archivé(s)` },
}

/** Écran d'une vue de la sous-catégorie Spenders (Liste / À relancer / Alertes R10 / Archive). */
export function SpendersTemplate({
  data,
  view,
  isAdmin,
}: {
  data: SpendersData
  view: SpendersViewKind
  isAdmin?: boolean
}) {
  const freshness = data.capturedAt
    ? new Date(data.capturedAt).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const actifs = data.spenders.filter((s) => !s.archived)
  const meta = META[view]
  const shownCount =
    view === 'archive'
      ? data.spenders.length - actifs.length
      : view === 'tracker'
        ? actifs.filter(isARelancer).length
        : view === 'alertes'
          ? actifs.filter((s) => s.compteurR >= R_ALERTE).length
          : actifs.length

  const caTotal = actifs.reduce((s, x) => s + x.ca, 0)
  const aRelancer = actifs.filter(isARelancer).length
  const alertesR10 = actifs.filter((s) => s.compteurR >= R_ALERTE).length
  const orphelins = actifs.filter((s) => !s.chatterName && !s.assignedLabel).length

  const kpis: Array<Kpi & { accent?: string }> = [
    {
      key: 'spenders',
      label: 'Spenders trackés',
      value: String(actifs.length),
      deltaPct: null,
      trendLabel: `CA ≥ ${data.threshold} € net MyPuls`,
      hint: freshness ? `scrapé le ${freshness}` : '',
    },
    {
      key: 'ca',
      label: 'CA cumulé spenders',
      value: eur(caTotal),
      deltaPct: null,
      trendLabel: 'total vie de chaque fan',
      hint: 'somme des CA affichés',
      info: 'Somme des CA vie de tous les spenders actifs (chacun = tout son historique MyPuls). Repère de volume, pas un CA de période.',
    },
    {
      key: 'relancer',
      label: 'À relancer',
      value: String(aRelancer),
      deltaPct: null,
      trendLabel: 'non relancés aujourd’hui',
      hint: `cycle en cours (R < ${R_ALERTE})`,
      accent: 'border-t-amber-500',
    },
    {
      key: 'alertes',
      label: `Alertes R${R_ALERTE}`,
      value: String(alertesR10),
      deltaPct: null,
      trendLabel: 'fin de cycle — à archiver',
      hint: `${orphelins} non assigné(s)`,
      accent: 'border-t-red-500',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{meta.title}</h1>
        <p className="text-sm text-muted-foreground">
          {meta.sub(shownCount)}
          {freshness && ` · scrapé le ${freshness}`}
        </p>
      </div>

      {view === 'liste' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ accent, ...k }) => (
            <KpiCard key={k.key} kpi={k} accent={accent} />
          ))}
        </div>
      )}

      <SpendersView spenders={data.spenders} view={view} isAdmin={isAdmin} />
    </div>
  )
}
