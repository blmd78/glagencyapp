import { requireAccess } from '@/lib/auth'
import { getUncoveDashboard } from '@/features/uncove/services/get-uncove-dashboard'
import { getUncoveAccounts } from '@/features/uncove/services/get-uncove-accounts'
import { UncoveTemplate } from '@/features/uncove/UncoveTemplate'

// Uncove (analytics par compte, face Chatteurs). Lecture pour qui porte le slug `uncove` ;
// la gestion des comptes (ajout/suppression de token) est réservée à l'admin (garde dans les
// Server Actions). Spec : docs/superpowers/specs/2026-09-21-uncove-analytics-design.md
export default async function UncovePage() {
  const profile = await requireAccess('uncove')
  const isAdmin = profile.role === 'admin'
  const [dashboard, accounts] = await Promise.all([
    getUncoveDashboard(),
    isAdmin ? getUncoveAccounts() : Promise.resolve([]),
  ])
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Uncove</h1>
      <UncoveTemplate dashboard={dashboard} accounts={accounts} isAdmin={isAdmin} />
    </div>
  )
}
