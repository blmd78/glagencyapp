'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Combobox } from '@/components/ui/combobox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable } from '@/components/data-table/data-table'
import { canExpand, columns } from './chatters-columns'
import { chatterSubRows } from './chatters-sub-rows'
import { downloadRanking } from './download-ranking'
import type { ChatterRow, DailyRanking } from '@/lib/types/chatters'

export function ChattersTable({
  chatters,
  dailyRanking = null,
}: {
  chatters: ChatterRow[]
  dailyRanking?: DailyRanking | null
}) {
  const [modelId, setModelId] = useState('all')

  // Options du sélecteur : les comptes OF présents dans les données de la période
  // (dédupliqués par creator_id — deux comptes peuvent partager un nom).
  const byId = new Map<string, string>()
  for (const c of chatters) for (const m of c.models) byId.set(m.creatorId, m.model)
  const modelOptions = [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))

  const filtered =
    modelId === 'all' ? chatters : chatters.filter((c) => c.models.some((m) => m.creatorId === modelId))

  return (
    <DataTable
      data={filtered}
      columns={columns}
      filterColumnId="name"
      filterPlaceholder="Filtrer par chatteur…"
      initialSorting={[{ id: 'ca', desc: true }]}
      getRowId={(c) => c.id}
      getRowCanExpand={(row) => canExpand(row.original)}
      renderSubRows={chatterSubRows}
      countLabel={(n) => `${n} chatteur(s)`}
      toolbar={
        <>
          <Combobox
            value={modelId}
            onChange={setModelId}
            className="w-44"
            searchPlaceholder="Rechercher un modèle…"
            options={[
              { value: 'all', label: 'Tous les modèles' },
              ...modelOptions.map(([id, name]) => ({ value: id, label: name })),
            ]}
          />
          {dailyRanking && dailyRanking.names.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="size-3.5" />
                  Classement du jour
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => downloadRanking(dailyRanking, 10)}>
                  Top 10
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadRanking(dailyRanking, 15)}>
                  Top 15
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      }
    />
  )
}
