import { getPlanning, getPlanningMembers } from '@/features/planning/services/get-planning'
import { PlanningTemplate } from '@/features/planning/PlanningTemplate'
import { requireAccess } from '@/lib/auth'

/**
 * Planning journalier : un membre (sous-manager) voit LE SIEN (RLS), un admin choisit
 * le membre via `?membre=` et édite (blocs, priorité, annexes).
 */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ membre?: string }>
}) {
  const profile = await requireAccess('planning')
  const isAdmin = profile.role === 'admin'

  if (!isAdmin) {
    return <PlanningTemplate data={await getPlanning(profile.id)} isAdmin={false} members={[]} />
  }

  const members = await getPlanningMembers()
  const { membre } = await searchParams
  const target = membre && members.some((m) => m.id === membre) ? membre : (members[0]?.id ?? null)
  return (
    <PlanningTemplate
      data={target ? await getPlanning(target) : null}
      isAdmin
      members={members}
    />
  )
}
