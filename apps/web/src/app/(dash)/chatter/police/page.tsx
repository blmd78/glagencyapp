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
  searchParams: Promise<{ day?: string }>
}) {
  const profile = await requireAccess('police')
  const { day } = await searchParams
  // Kickoff SANS await : le header (titre + sélecteur de jour) est un widget client
  // (`PoliceView`, useRouter) qui a besoin de `data.day`/`data.days` — pas de h1
  // « immédiat » séparable ici sans casser la mise en page (titre et sélecteur streament
  // ensemble, cf. scripts/planning + docs/guidelines-data-loading.md §3).
  const data = getPolice(day ?? null, profile)

  // Droit d'écriture (saisie avert./malus, édition malus) : admin ou manager/sous-manager —
  // un chatteur consulte le tracker en lecture seule (miroir UI de hasWriteAccess).
  const canWrite = profile.role === 'admin' || profile.manager

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
