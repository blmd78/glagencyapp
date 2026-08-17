'use client'

// Historique agrégé PAR CHATTEUR (demande Benoit 2026-08-17) : une ligne = un chatteur sur la
// période, totaux en face, dépliable en détail ligne par ligne — même patron accordéon que la
// page Chatters. Ce fichier ne garde que le câblage DataTable ; colonnes + agrégation vivent
// dans `police-columns.tsx`, le détail déplié dans `police-sub-rows.tsx`.

import { useMemo } from 'react'
import { DataTable } from '@/components/data-table/data-table'
import { groupByChatter, POLICE_COLUMNS } from './police-columns'
import { policeSubRows } from './police-sub-rows'
import type { PoliceData, PoliceEntry } from '../types'

/** Historique de la période (datepicker global), agrégé par chatteur et dépliable. La recherche
 *  est CONTRÔLÉE par le parent (`PoliceView`) : les entrées arrivent déjà filtrées, pour que les
 *  KPIs au-dessus racontent la même chose que la table (même input, mêmes classes — patron
 *  « recherche client contrôlée » documenté sur DataTable). `data` descend jusqu'aux sous-lignes :
 *  le crayon y rouvre LE dialog de saisie pré-rempli (options chatteur, période, aide-décision). */
export function PoliceTable({
  data,
  entries,
  canWrite,
  search,
  onSearchChange,
}: {
  data: PoliceData
  entries: PoliceEntry[]
  canWrite: boolean
  search: string
  onSearchChange: (next: string) => void
}) {
  const groups = useMemo(() => groupByChatter(entries), [entries])
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Historique de la période</h2>
      <DataTable
        data={groups}
        columns={POLICE_COLUMNS}
        search={search}
        onSearchChange={onSearchChange}
        filterPlaceholder="Rechercher un chatter…"
        initialSorting={[{ id: 'totalMalus', desc: true }]}
        pageSize={20}
        getRowId={(g) => g.chatterId}
        getRowCanExpand={() => true}
        renderSubRows={(row) => policeSubRows(row, canWrite, data)}
        countLabel={(n) => `${n} chatter(s)`}
      />
    </section>
  )
}
