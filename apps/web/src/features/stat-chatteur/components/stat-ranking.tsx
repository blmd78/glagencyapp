'use client'

import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { RoleBadge } from '@/components/role-badge'
import { TeamBadge } from '@/components/team-badge'
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

type RoleFiltre = 'tous' | 'setter' | 'closer'
type TeamFiltre = 'toutes' | 'rouge' | 'bleue'

const ROLE_OPTS: { value: RoleFiltre; label: string }[] = [
  { value: 'tous', label: 'Tous les rôles' },
  { value: 'setter', label: 'Setter' },
  { value: 'closer', label: 'Closer' },
]
const TEAM_OPTS: { value: TeamFiltre; label: string }[] = [
  { value: 'toutes', label: 'Toutes les équipes' },
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
    cell: ({ getValue }) => <RoleBadge role={getValue() as ClosingChatterRow['closingRole']} />,
  },
  {
    accessorKey: 'closingTeam',
    header: 'Équipe',
    cell: ({ getValue }) => {
      const team = getValue() as ClosingChatterRow['closingTeam']
      return team ? <TeamBadge team={team} /> : <span className="text-muted-foreground">—</span>
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
 * Classement des chatteurs closing par ventes — 2 filtres INDÉPENDANTS 100% CLIENT (Rôle + Équipe),
 * combinés en ET : on peut ne filtrer sur rien (Tous + Toutes), sur l'un, ou sur les deux (ex.
 * Setter + Rouge). Aucun round-trip serveur (`rows` déjà chargées par la page). Tri par défaut sur
 * `vendu` décroissant (les `rows` arrivent déjà triées côté service ; la DataTable permute au clic).
 */
export function StatRanking({ rows }: { rows: ClosingChatterRow[] }) {
  const [roleFiltre, setRoleFiltre] = useState<RoleFiltre>('tous')
  const [teamFiltre, setTeamFiltre] = useState<TeamFiltre>('toutes')

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (roleFiltre === 'tous' || r.closingRole === roleFiltre) &&
          (teamFiltre === 'toutes' || r.closingTeam === teamFiltre),
      ),
    [rows, roleFiltre, teamFiltre],
  )

  return (
    <DataTable
      data={filtered}
      columns={columns}
      initialSorting={[{ id: 'vendu', desc: true }]}
      getRowId={(r) => r.id}
      countLabel={(n) => `${n} chatteur(s)`}
      toolbar={
        <div className="flex flex-wrap gap-2">
          <Select value={roleFiltre} onValueChange={(v) => setRoleFiltre(v as RoleFiltre)}>
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={teamFiltre} onValueChange={(v) => setTeamFiltre(v as TeamFiltre)}>
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  )
}
