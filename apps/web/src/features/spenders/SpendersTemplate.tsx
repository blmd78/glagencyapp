import { frDateTimeParis } from '@glagency/core'
import { SpendersView, type SpendersViewKind } from './components/spenders-view'
import { isARelancer, R_ALERTE, type SpendersData } from './types'

// Le h1 (titre) remonte dans chaque page.tsx (pattern standard, s'affiche immédiatement,
// avant que la donnée réponde) — ce Template ne garde que le sous-titre, qui a besoin de
// `shownCount`/`freshness` calculés depuis la donnée streamée. Les cartes KPI de la Liste
// vivent dans SpendersView (client) : elles se recalculent sur le modèle sélectionné.
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

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {SUB[view](shownCount)}
        {freshness && ` · scrapé le ${freshness}`}
      </p>

      <SpendersView
        spenders={data.spenders}
        view={view}
        isAdmin={isAdmin}
        canWrite={canWrite}
        threshold={data.threshold}
        freshness={freshness}
      />
    </div>
  )
}
