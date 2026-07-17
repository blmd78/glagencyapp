import { VaView } from './components/va-view'
import type { MktStaffData } from './types'

export function MktVaTemplate({ data, isAdmin }: { data: MktStaffData; isAdmin: boolean }) {
  const vas = data.staff.filter((s) => s.role === 'va')
  const active = vas.filter((s) => s.active).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">VA</h1>
        <p className="text-sm text-muted-foreground">
          {vas.length} VA ({active} actifs) · fiches, rémunération et assignations —
          la paie se règle dans Compta
        </p>
      </div>

      <VaView data={data} isAdmin={isAdmin} />
    </div>
  )
}
