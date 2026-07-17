import { frDateTimeParis } from '@glagency/core'
import { KpiCard, type Kpi } from '@/components/kpi-card'
import { eur } from '@/lib/format'
import { SpendersView, type SpendersViewKind } from './components/spenders-view'
import { isARelancer, R_ALERTE, type SpendersData } from './types'

// Le h1 (titre) remonte dans chaque page.tsx (pattern standard, s'affiche immédiatement,
// avant que la donnée réponde) — ce Template ne garde que le sous-titre, qui a besoin de
// `shownCount`/`freshness` calculés depuis la donnée streamée.
const SUB: Record<SpendersViewKind, (n: number) => string> = {
  liste: (n) => `${n} fan(s) tracké(s)`,
  tracker: (n) => `${n} spender(s) à cocher aujourd’hui (R < ${R_ALERTE})`,
  alertes: (n) => `${n} spender(s) en fin de cycle — à archiver`,
  archive: (n) => `${n} spender(s) archivé(s)`,
}

/** Écran d'une vue de la sous-catégorie Spenders (Liste / À relancer / Alertes R10 / Archive). */
export function SpendersTemplate({
  data,
  view,
  isAdmin,
  canWrite,
}: {
  data: SpendersData
  view: SpendersViewKind
  isAdmin?: boolean
  /** admin ou manager/sous-manager : peut reset/archiver (0060). Calculé dans la page. */
  canWrite?: boolean
}) {
  // TZ Paris explicite (frDateTimeParis) : ce texte est calculé en SSR — la cadence
  // relance étant calendaire Europe/Paris (§ types.ts), la fraîcheur affichée doit rester
  // dans ce fuseau quelle que soit l'heure UTC du serveur (même règle que LastRelance,
  // spenders-table.tsx).
  const freshness = data.capturedAt ? frDateTimeParis(data.capturedAt) : null

  const actifs = data.spenders.filter((s) => !s.archived)
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
      <p className="-mt-4 text-sm text-muted-foreground">
        {SUB[view](shownCount)}
        {freshness && ` · scrapé le ${freshness}`}
      </p>

      {view === 'liste' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ accent, ...k }) => (
            <KpiCard key={k.key} kpi={k} accent={accent} />
          ))}
        </div>
      )}

      <SpendersView spenders={data.spenders} view={view} isAdmin={isAdmin} canWrite={canWrite} />
    </div>
  )
}
