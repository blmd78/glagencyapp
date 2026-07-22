'use client'

import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import type { ClosingChatterRow } from '../types'

type Filtre = 'mixe' | 'setter' | 'closer' | 'rouge' | 'bleue'

const FILTRES: { value: Filtre; label: string }[] = [
  { value: 'mixe', label: 'Mixé' },
  { value: 'setter', label: 'Setter' },
  { value: 'closer', label: 'Closer' },
  { value: 'rouge', label: 'Rouge' },
  { value: 'bleue', label: 'Bleue' },
]

const columns: ColumnDef<ClosingChatterRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <Sortable column={column} label="Chatteur" />,
    cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span>,
  },
  {
    accessorKey: 'closingRole',
    header: 'Rôle',
    cell: ({ getValue }) => (
      <Badge variant="secondary">{getValue() === 'closer' ? 'Closer' : 'Setter'}</Badge>
    ),
  },
  {
    accessorKey: 'closingTeam',
    header: 'Équipe',
    cell: ({ getValue }) => {
      const team = getValue() as ClosingChatterRow['closingTeam']
      if (!team) return <span className="text-muted-foreground">—</span>
      return (
        <Badge
          className={
            team === 'rouge'
              ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
          }
        >
          {team === 'rouge' ? 'Rouge' : 'Bleue'}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'vendu',
    header: ({ column }) => <Sortable column={column} label="Ventes" className="justify-end" />,
    cell: ({ getValue }) => (
      <span className="font-medium tabular-nums">{(getValue() as number).toLocaleString('fr-FR')}</span>
    ),
    meta: { align: 'right' },
  },
]

/**
 * Classement des chatteurs closing par ventes — filtre single-select 100% CLIENT (aucun
 * round-trip serveur, `rows` déjà chargées par la page). Tri par défaut sur `vendu` décroissant
 * (les `rows` arrivent déjà triées côté service ; la DataTable ne fait que le confirmer/permuter
 * au clic).
 */
export function StatRanking({ rows }: { rows: ClosingChatterRow[] }) {
  const [filtre, setFiltre] = useState<Filtre>('mixe')

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        filtre === 'mixe'
          ? true
          : filtre === 'setter' || filtre === 'closer'
            ? r.closingRole === filtre
            : r.closingTeam === filtre,
      ),
    [rows, filtre],
  )

  return (
    <DataTable
      data={filtered}
      columns={columns}
      initialSorting={[{ id: 'vendu', desc: true }]}
      getRowId={(r) => r.id}
      countLabel={(n) => `${n} chatteur(s)`}
      toolbar={
        <Select value={filtre} onValueChange={(v) => setFiltre(v as Filtre)}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTRES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  )
}
