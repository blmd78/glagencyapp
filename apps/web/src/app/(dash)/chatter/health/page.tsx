import { getHealth } from '@/features/health/services/get-health'
import { requireAccess } from '@/lib/auth'
import { HealthTemplate } from '@/features/health/HealthTemplate'
import { resolvePeriod } from '@/lib/period'

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('health')
  const period = resolvePeriod(await searchParams)
  const data = await getHealth(period, { restricted: profile.role !== 'admin' })
  return <HealthTemplate data={data} />
}
