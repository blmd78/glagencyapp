import { UncoveDashboard } from './components/uncove-dashboard'
import { UncoveAccounts } from './components/uncove-accounts.client'
import type { UncoveDashboardData, UncoveAccountRow } from './types'

export function UncoveTemplate({
  dashboard,
  accounts,
  isAdmin,
}: {
  dashboard: UncoveDashboardData
  accounts: UncoveAccountRow[]
  isAdmin: boolean
}) {
  return (
    <div className="flex flex-col gap-8">
      <UncoveDashboard data={dashboard} />
      {isAdmin && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Comptes</h2>
          <UncoveAccounts accounts={accounts} />
        </section>
      )}
    </div>
  )
}
