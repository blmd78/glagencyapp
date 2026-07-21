import { Suspense } from 'react'
import { getPolice } from '@/features/police/services/get-police'
import { PoliceTemplate } from '@/features/police/PoliceTemplate'
import { PoliceSkeleton } from '@/features/police/components/police-skeleton'
import { requireAccess } from '@/lib/auth'
import type { PoliceData } from '@/features/police/types'

// Tracker sanctions « Police » — accordable via le droit `police` (policiers/managers).
export default async function PolicePage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; day?: string; month?: string }>
}) {
  const profile = await requireAccess('police')
  const { vue: vueParam, day, month } = await searchParams
  // Mode d'affichage : `mois` explicite, sinon `jour` (défaut = comportement historique).
  const vue = vueParam === 'mois' ? 'mois' : 'jour'
  // Kickoff SANS await : le header (titre + bascule + sélecteur) est un widget client
  // (`PoliceView`, useRouter) qui a besoin de `data.vue`/`data.day(s)`/`data.month(s)` — pas de h1
  // « immédiat » séparable ici sans casser la mise en page (titre et sélecteur streament
  // ensemble, cf. scripts/planning + docs/guidelines-data-loading.md §3).
  const data = getPolice(profile, { vue, day, month })

  // Droit d'écriture (saisie avert./malus, édition malus) : admin, manager/sous-manager, ou
  // le rôle fonctionnel `police` lui-même — un chatteur consulte en lecture seule. `requireAccess`
  // a déjà vérifié la page pour un non-admin, donc `baseRole === 'police'` ici a forcément la page.
  const canWrite = profile.role === 'admin' || profile.manager || profile.baseRole === 'police'

  return (
    <Suspense fallback={<PoliceSkeleton />}>
      <PoliceContent data={data} isAdmin={profile.role === 'admin'} canWrite={canWrite} />
    </Suspense>
  )
}

async function PoliceContent({
  data,
  isAdmin,
  canWrite,
}: {
  data: Promise<PoliceData>
  isAdmin: boolean
  canWrite: boolean
}) {
  return <PoliceTemplate data={await data} isAdmin={isAdmin} canWrite={canWrite} />
}
