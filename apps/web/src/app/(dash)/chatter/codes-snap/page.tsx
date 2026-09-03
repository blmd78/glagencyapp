import { Suspense } from 'react'
import { getSnapCodes } from '@/features/snap-codes/services/get-snap-codes'
import { SnapCodesTemplate } from '@/features/snap-codes/SnapCodesTemplate'
import { requireAccess } from '@/lib/auth'
import { getCreatorScope } from '@/lib/services/creator-scope'
import { writableCreatorIds } from '@/features/snap-codes/access'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { SnapCodesData, SnapEditMode } from '@/features/snap-codes/types'

// Codes Snap (groupe Accès, porté de gla-workflow) — page ASSIGNABLE : lecture pour qui a
// la page ; écriture admin sur tout, manager / sous-manager sur SES modèles assignés (règle
// unique `features/snap-codes/access.ts`, miroir de la garde de `saveSnapCode`).
export default async function CodesSnapPage() {
  const profile = await requireAccess('codes-snap')
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le tableau streame dans
  // son boundary dès que les lectures répondent. Le périmètre n'est lu que pour un encadrant
  // (`profile.manager`), le seul que la règle consulte. Un encadrant ne voit déjà que SES
  // modèles (RLS `creators_scoped_read`) : `editable` couvre alors toute sa liste.
  const data = getSnapCodes()
  const assigned = profile.manager ? getCreatorScope(profile.id, profile.baseRole) : Promise.resolve(null)
  const editable = Promise.all([data, assigned]).then(([d, a]) =>
    writableCreatorIds(profile, a, d.rows.map((r) => r.creatorId)),
  )
  // Le sous-titre dit le DROIT, pas une longueur de liste : un admin sans modèle actif ou un
  // encadrant sans assignation liraient sinon « lecture seule » sans savoir pourquoi.
  const mode: SnapEditMode =
    profile.role === 'admin' ? 'all'
    : !profile.manager ? 'none'
    : (await assigned) ? 'scoped' : 'unassigned'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Codes Snap</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <CodesSnapContent data={data} editable={editable} mode={mode} />
      </Suspense>
    </div>
  )
}

async function CodesSnapContent({
  data,
  editable,
  mode,
}: {
  data: Promise<SnapCodesData>
  editable: Promise<string[]>
  mode: SnapEditMode
}) {
  const [d, e] = await Promise.all([data, editable])
  return <SnapCodesTemplate data={d} editable={e} mode={mode} />
}
