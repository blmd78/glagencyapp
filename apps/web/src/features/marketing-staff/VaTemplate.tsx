import { VaView } from './components/va-view'
import type { MktStaffData } from './types'

export function MktVaTemplate({
  data,
  isAdmin,
  canWrite,
}: {
  data: MktStaffData
  isAdmin: boolean
  canWrite: boolean
}) {
  const vas = data.staff.filter((s) => s.role === 'va')
  const active = vas.filter((s) => s.active).length

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {vas.length} VA ({active} actifs) · fiches, rémunération et assignations —
        la paie se règle dans Compta
      </p>

      <VaView data={data} isAdmin={isAdmin} canWrite={canWrite} />
    </div>
  )
}
