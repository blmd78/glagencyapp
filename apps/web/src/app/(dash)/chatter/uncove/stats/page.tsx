import { requireAccess } from '@/lib/auth'
import { getUncoveDashboard } from '@/features/uncove/services/get-uncove-dashboard'
import { UncoveDashboard } from '@/features/uncove/components/uncove-dashboard'

// Uncove › Stats — dashboard Subs + CA par compte. Lecture pour qui porte le slug `uncove`.
export default async function UncoveStatsPage() {
  await requireAccess('uncove')
  const dashboard = await getUncoveDashboard()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Uncove — Stats</h1>
      <UncoveDashboard data={dashboard} />
    </div>
  )
}
