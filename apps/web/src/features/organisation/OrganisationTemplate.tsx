import { KpiCard, type Kpi } from '@/components/kpi-card'
import { OrgTable } from './components/org-table'
import type { OrganisationData } from './types'

/**
 * Board d'orga de l'agence — même DA que le planning repos (chips, cases « + Ajouter »),
 * cartes KPI au-dessus. Tout est dérivé de Membres/Chatters et les éditions écrivent ces
 * mêmes données (write-through) — cf. get-organisation / actions.ts.
 */
export function OrganisationTemplate({ data, isAdmin }: { data: OrganisationData; isAdmin: boolean }) {
  const { counts, orphanModels } = data

  const kpis: Array<Kpi & { accent?: string }> = [
    // Liserés = code couleur de l'app (bleu chatter, vert encadrement, violet modèles) ;
    // l'AMBRE d'alerte prime quand il y a un trou à régler, comme le rouge des chips.
    {
      key: 'chatteurs',
      label: 'Chatters',
      value: String(counts.chatteurs),
      deltaPct: null,
      trendLabel: 'membres rôle chatter',
      hint: 'effectif réel',
      accent: 'border-t-blue-500',
    },
    {
      key: 'sousManagers',
      label: 'Sous-managers',
      value: String(counts.sousManagers),
      deltaPct: null,
      trendLabel: `${counts.managers} équipe${counts.managers > 1 ? 's' : ''} managers`,
      hint: 'rattachements à jour dans Membres',
      accent: 'border-t-green-500',
    },
    {
      key: 'modeles',
      label: 'Modèles actifs',
      value: String(counts.modeles),
      deltaPct: null,
      trendLabel: orphanModels.length ? `${orphanModels.length} sans équipe` : 'tous couverts',
      hint: 'assignés via Membres',
      accent: orphanModels.length ? 'border-t-amber-500' : 'border-t-violet-500',
    },
    {
      key: 'aPlacer',
      label: 'À placer',
      value: String(counts.aPlacer),
      deltaPct: null,
      trendLabel: 'sans shift renseigné',
      hint: 'lien MyPuls ou shift à régler',
      accent: counts.aPlacer ? 'border-t-amber-500' : 'border-t-blue-500',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        Dérivé de Membres (assignations, rattachements) et des fiches Chatters (shift), à jour
        en permanence — éditer une case met à jour les assignations et le shift.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ accent, ...k }) => (
          <KpiCard key={k.key} kpi={k} accent={accent} />
        ))}
      </div>

      <OrgTable data={data} isAdmin={isAdmin} />

      {orphanModels.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Modèles actifs sans équipe (aucun manager/sous-manager assigné) :{' '}
          {orphanModels.join(', ')} — à régler dans Membres.
        </p>
      )}
    </div>
  )
}
