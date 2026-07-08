import { getMktStaff } from '@/features/marketing/services/get-staff'
import { MktStaffTemplate } from '@/features/marketing/StaffTemplate'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'

export default async function MktStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-compta')
  const period = resolvePeriod(await searchParams)
  return <MktStaffTemplate data={await getMktStaff(period)} />
}
