import { StaffView } from './components/staff-view'
import type { MktStaffData } from './types'

export function MktStaffTemplate({ data, isAdmin }: { data: MktStaffData; isAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compta</h1>
          <p className="text-sm text-muted-foreground">
            Paie du staff marketing · payes automatiques (fixe + variable), paiements suivis
          </p>
        </div>
      </div>

      <StaffView data={data} isAdmin={isAdmin} />
    </div>
  )
}
