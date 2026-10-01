import { num } from '@/lib/format'
import { TraficView } from './components/trafic-view'
import { TraficViewEditable } from './components/trafic-view-editable.client'
import type { TraficData } from './types'

export function TraficTemplate({ data, canEdit }: { data: TraficData; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.periodLabel} · {data.links.length} lien(s) LinkScale avec du trafic · {num(data.totals.cur.visitors)} visiteurs
      </p>
      {canEdit ? <TraficViewEditable data={data} /> : <TraficView data={data} />}
    </div>
  )
}
