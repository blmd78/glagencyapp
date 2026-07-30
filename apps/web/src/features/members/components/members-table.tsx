'use client'

// Composition de la table Membres — les défs de colonnes et actions de ligne vivent dans
// `members-columns.tsx` (split « > 300 lignes », même découpe que le pilote chatters).

import { useState } from 'react'
import { TriangleAlert, UserPlus } from 'lucide-react'
import { isStaleNew } from '@glagency/core'
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
    .map((m) => ({ id: m.id, name: m.displayName, role: m.role }))

  const columns = buildMembersColumns({ creators, chatters, managers, scope, viewer, superadmin })

  // LE point de contrôle du drapeau « nouvel arrivant » (0101). Un drapeau posé à la main, personne
  // ne le retire : sans ce compteur unique, le rappel n'existerait que dispersé dans les six écrans
  // qui affichent le badge, et « nouveau » finirait par ne plus rien vouloir dire.
  // Filtre de VUE (pas d'URL) : il ne change pas la donnée chargée, juste ce qu'on montre d'un jeu
  // déjà là — `useState` local, comme le sélecteur de modèle du pilote chatters (norme §6).
  const [onlyStale, setOnlyStale] = useState(false)
  const stale = members.filter((m) => isStaleNew(m.isNew, m.arrivedAt))
  const rows = onlyStale ? stale : members

  return (
    <DataTable
      data={rows}
      columns={columns}
      filterColumnId="displayName"
      filterPlaceholder="Filtrer par nom…"
      initialSorting={[{ id: 'createdAt', desc: false }]}
      pageSize={20}
      // Identité STABLE des lignes : sans elle TanStack keye par index — après une
      // suppression, les MemberDialog montés en ligne se réapparient par position et
      // servent l'état RHF d'un AUTRE membre (seule DataTable de l'app qui l'omettait).
      getRowId={(m) => m.id}
      countLabel={(n) => `${n} membre(s)`}
      toolbar={
        <div className="flex items-center gap-2">
          {/* Rendu SEULEMENT s'il y a des cas : une toolbar qui affiche « 0 à revoir » en
              permanence est un bruit dont l'œil apprend à se passer. */}
          {stale.length > 0 && (
            <Button
              size="sm"
              variant={onlyStale ? 'default' : 'outline'}
              className="gap-1.5"
              aria-pressed={onlyStale}
              onClick={() => setOnlyStale((v) => !v)}
            >
              <TriangleAlert className="size-3.5" />
              {stale.length} à revoir
            </Button>
          )}
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
        </div>
      }
    />
  )
}
