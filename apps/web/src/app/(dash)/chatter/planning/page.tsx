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
    return (
      <PlanningTemplate
        data={await getPlanning(profile.id)}
        isAdmin={false}
        canEdit={false}
        members={[]}
      />
    )
  }

  // Superadmin : sélecteur membres + admins ; admin : membres uniquement. Toute cible
  // visible est donc éditable par son spectateur (la garde requireCanEdit + la RLS 0043
  // restent la défense contre un appel d'action forgé vers le planning d'un admin).
  const members = await getPlanningMembers(profile.superadmin)
  const { membre } = await searchParams
  const target = membre && members.some((m) => m.id === membre) ? membre : (members[0]?.id ?? null)
  return (
    <PlanningTemplate
      data={target ? await getPlanning(target) : null}
      isAdmin
      canEdit
      members={members}
    />
  )
}
