import { getMktStaff } from '@/features/marketing-staff/services/get-staff'
import { MktVaTemplate } from '@/features/marketing-staff/VaTemplate'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'

export default async function MktVaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('mkt-staff')
  const period = resolvePeriod(await searchParams)
  return <MktVaTemplate data={await getMktStaff(period)} isAdmin={profile.role === 'admin'} />
}
