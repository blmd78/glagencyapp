'use client'

// Composition de la table Membres — les défs de colonnes et actions de ligne vivent dans
// `members-columns.tsx` (split « > 300 lignes », même découpe que le pilote chatters).

import { useState } from 'react'
import { RotateCcw, Sparkles, TriangleAlert, UserPlus } from 'lucide-react'
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

  // ── LES QUATRE VUES DE LA LISTE ────────────────────────────────────────────────────────────
  // UN SEUL filtre actif à la fois, et c'est délibéré : des bascules indépendantes autorisaient
  // des combinaisons qui n'existent pas — « nouveau ET parti » ne désigne personne, et l'écran
  // affichait alors une liste vide sans qu'on comprenne pourquoi. Recliquer le filtre actif
  // revient à « en poste ».
  //
  // Filtres de VUE et non d'URL (norme §6) : ils ne changent pas la donnée chargée, seulement ce
  // qu'on montre d'un jeu déjà là — `useState` local, comme le sélecteur de modèle du pilote.
  const [filtre, setFiltre] = useState<'poste' | 'nouveaux' | 'a-revoir' | 'anciens'>('poste')

  const anciens = members.filter((m) => m.leftAt)
  const enPoste = members.filter((m) => !m.leftAt)
  const nouveaux = enPoste.filter((m) => m.isNew)
  // `aRevoir` se calcule sur les membres EN POSTE : un parti n'a plus de drapeau à décocher, et le
  // laisser gonfler le compteur enverrait s'occuper de quelqu'un qui n'est plus là.
  const aRevoir = enPoste.filter((m) => isStaleNew(m.isNew, m.arrivedAt))

  const rows =
    filtre === 'nouveaux' ? nouveaux : filtre === 'a-revoir' ? aRevoir : filtre === 'anciens' ? anciens : enPoste

  /** Bascule d'un filtre : le recliquer revient à la vue par défaut. */
  const bascule = (cible: typeof filtre) => () => setFiltre((f) => (f === cible ? 'poste' : cible))

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
        <div className="flex flex-wrap items-center gap-2">
          {/* Chaque bouton n'apparaît QUE s'il a des cas : une toolbar qui affiche « 0 à revoir »
              en permanence est un bruit dont l'œil apprend à se passer. */}
          {nouveaux.length > 0 && (
            <Button
              size="sm"
              variant={filtre === 'nouveaux' ? 'default' : 'outline'}
              className="gap-1.5"
              aria-pressed={filtre === 'nouveaux'}
              onClick={bascule('nouveaux')}
            >
              <Sparkles className="size-3.5" />
              {nouveaux.length} nouveau{nouveaux.length > 1 ? 'x' : ''}
            </Button>
          )}
          {aRevoir.length > 0 && (
            <Button
              size="sm"
              variant={filtre === 'a-revoir' ? 'default' : 'outline'}
              className="gap-1.5"
              aria-pressed={filtre === 'a-revoir'}
              onClick={bascule('a-revoir')}
            >
              <TriangleAlert className="size-3.5" />
              {aRevoir.length} à revoir
            </Button>
          )}
          {anciens.length > 0 && (
            <Button
              size="sm"
              variant={filtre === 'anciens' ? 'default' : 'outline'}
              className="gap-1.5"
              aria-pressed={filtre === 'anciens'}
              onClick={bascule('anciens')}
            >
              <RotateCcw className="size-3.5" />
              {anciens.length} à réactiver
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
