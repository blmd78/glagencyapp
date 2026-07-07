import { getPolice } from '@/features/police/services/get-police'
import { PoliceTemplate } from '@/features/police/PoliceTemplate'
import { requireAccess } from '@/lib/auth'

// Tracker sanctions « Police » — accordable via le droit `police` (policiers/managers).
export default async function PolicePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>
}) {
  const profile = await requireAccess('police')
  const { day } = await searchParams
  const data = await getPolice(day ?? null)
  return <PoliceTemplate data={data} isAdmin={profile.role === 'admin'} />
}
