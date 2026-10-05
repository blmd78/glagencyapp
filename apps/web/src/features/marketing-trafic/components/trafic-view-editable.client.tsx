'use client'

import { TraficView } from './trafic-view'
import { EditAttributionDialog } from './edit-attribution-dialog.client'
import type { TraficData } from '../types'

/** La vue avec le crayon de correction : la fonction de cellule naît côté client (non sérialisable). */
export function TraficViewEditable({ data }: { data: TraficData }) {
  return (
    <TraficView
      data={data}
      editCell={(r) =>
        r.edit && (
          <EditAttributionDialog edit={r.edit} label={r.label} creators={data.creators} accounts={data.accounts} />
        )
      }
    />
  )
}
