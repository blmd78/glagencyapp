import { OrgTable } from './components/org-table'
import type { OrganisationData } from './types'

/**
 * Board d'orga de l'agence — IDENTIQUE à la Google Sheet (un seul tableau, manager fusionné),
 * éditable comme le planning repos. Tout est dérivé de Membres/Chatters et les éditions
 * écrivent ces mêmes données (write-through) — cf. get-organisation / actions.ts.
 */
export function OrganisationTemplate({ data, isAdmin }: { data: OrganisationData; isAdmin: boolean }) {
  const { counts, orphanModels } = data
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {counts.chatteurs} chatters · {counts.sousManagers} sous-managers · {counts.managers}{' '}
        équipes · {counts.modeles} modèles actifs — dérivé de Membres et des fiches Chatters,
        à jour en permanence ; éditer une case met à jour les assignations et le shift.
      </p>

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
