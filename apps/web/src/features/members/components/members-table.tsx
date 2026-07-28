'use client'

// Composition de la table Membres — les défs de colonnes et actions de ligne vivent dans
// `members-columns.tsx` (split « > 300 lignes », même découpe que le pilote chatters).

import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-table/data-table'
import { buildMembersColumns } from './members-columns'
import { MemberDialog } from './member-dialog'
import type { Member } from '../types'

export function MembersTable({
  members,
  creators,
  chatters,
  scope = 'chatter',
  viewer = 'admin',
  superadmin = false,
}: {
  members: Member[]
  creators: { id: string; name: string }[]
  /** Chatteurs MyPuls sélectionnables pour le lien (champ superadmin uniquement). */
  chatters: { id: string; name: string }[]
  scope?: 'chatter' | 'marketing'
  viewer?: 'admin' | 'manager'
  /** Propriétaire : option rôle Admin + gestion des fiches admin. */
  superadmin?: boolean
}) {
  // Managers rattachables (sélecteur admin du dialog) — dérivés de la liste courante.
  const managers = members
    .filter((m) => m.role === 'manager' || m.role === 'sous-manager')
    .map((m) => ({ id: m.id, name: m.displayName }))

  const columns = buildMembersColumns({ creators, chatters, managers, scope, viewer, superadmin })

  return (
    <DataTable
      data={members}
      columns={columns}
      filterColumnId="displayName"
      filterPlaceholder="Filtrer par nom…"
      initialSorting={[{ id: 'createdAt', desc: false }]}
      pageSize={20}
      countLabel={(n) => `${n} membre(s)`}
      toolbar={
        <MemberDialog
          creators={creators}
          chatters={chatters}
          managers={managers}
          scope={scope}
          viewer={viewer}
          superadmin={superadmin}
          trigger={
            <Button size="sm" className="gap-1.5">
              <UserPlus className="size-3.5" />
              Nouveau membre
            </Button>
          }
        />
      }
    />
  )
}
