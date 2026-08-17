'use client'

// Défs de colonnes de la table Membres + actions de ligne — extraites de `members-table.tsx`
// (règle « > 300 lignes → split par responsabilité », même découpe que le pilote
// `chatters-columns.tsx`). `members-table.tsx` ne garde que la composition DataTable + toolbar.

import { type ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { NewBadge } from '@/components/new-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { pageChoicesFor, type WorkspaceId } from '@/config/workspaces'
import { ROLE_NAME, ROLE_TONE } from '@/lib/roles'
import { RowActions } from './member-row-actions'
import type { Member } from '../types'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

/** Badges limités à `max`, le reste en « +N ». */
function BadgeList({ items, max = 4 }: { items: { key: string; node: React.ReactNode }[]; max?: number }) {
  const shown = items.slice(0, max)
  const extra = items.length - shown.length
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((i) => i.node)}
      {extra > 0 && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          +{extra}
        </Badge>
      )}
    </div>
  )
}

export function buildMembersColumns({
  creators,
  chatters,
  managers,
  scope,
  viewer,
  superadmin,
}: {
  creators: { id: string; name: string }[]
  chatters: { id: string; name: string }[]
  managers: { id: string; name: string; role: string }[]
  scope: WorkspaceId
  viewer: 'admin' | 'manager'
  superadmin: boolean
}): ColumnDef<Member>[] {
  const creatorName = new Map(creators.map((c) => [c.id, c.name]))
  const choices = pageChoicesFor(scope)

  const modelsColumn: ColumnDef<Member>[] = scope === 'chatter' ? [
    {
      id: 'models',
      header: 'Modèles',
      cell: ({ row }) => {
        if (row.original.role === 'admin' || row.original.role === 'superadmin')
          return <span className="text-xs text-muted-foreground">tous</span>
        const items = row.original.creatorIds.map((id) => {
          const name = creatorName.get(id) ?? '—'
          return {
            key: id,
            node: (
              <Badge key={id} className={modelColor(name)}>
                {name}
              </Badge>
            ),
          }
        })
        return items.length ? (
          <BadgeList items={items} />
        ) : (
          <span className="text-xs text-muted-foreground">aucun</span>
        )
      },
    },
  ] : []

  return [
    {
      id: 'displayName',
      accessorKey: 'displayName',
      header: ({ column }) => <Sortable column={column} label="Membre" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium">
              {initials(row.original.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{row.original.displayName}</span>
              {/* Warning : membre chatteur SANS chatteur MyPuls lié → à relier (badges closing
                  vides tant que le lien manque). Visible aux admins (seuls à pouvoir relier). */}
              {viewer === 'admin' && row.original.role === 'chatteur' && !row.original.chatterId && (
                <span title="Aucun chatter MyPuls lié — à relier dans la fiche" className="shrink-0">
                  <AlertTriangle className="size-3.5 text-amber-500" aria-label="Aucun chatter MyPuls lié" />
                </span>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: ({ column }) => <Sortable column={column} label="Rôle" />,
      cell: ({ getValue, row }) =>
        // Libellés ET teintes depuis `lib/roles.ts` (source unique, partagée avec la pile de
        // noms du Dashboard/Planning). Seul l'icône « bouclier » de la direction reste ici.
        (() => {
          const role = getValue() as string
          const badge = (
            // Repli sur la teinte « chatter » : un rôle hors table (le `'user'` transitoire de
            // 0059, ou une valeur inconnue) doit garder un badge gris, pas le style plein par
            // défaut du composant — c'est ce que faisait la cascade de ternaires d'avant.
            <Badge className={cn('gap-1 text-xs', ROLE_TONE[role] ?? ROLE_TONE.chatteur)}>
              {(role === 'superadmin' || role === 'admin') && <ShieldCheck className="size-3" />}
              {ROLE_NAME[role] ?? ROLE_NAME.chatteur}
            </Badge>
          )
          // LA LIGNE NE GARDE QUE LE RÔLE ET LE DRAPEAU « NOUVEAU » (allègement Benoit
          // 2026-08-03). Closing, équipe et shift sont des attributs de CONFIGURATION, consultés
          // quand on gère les équipes, pas à chaque coup d'œil — six badges côte à côte ne se
          // lisaient plus. Le badge « Parti le … » est parti aussi : on ne voit des partis QUE
          // via le filtre « à réactiver », qui le dit déjà. Tout cela vit dans « Voir le
          // détail », d'un clic sur le menu de la ligne.
          return role === 'chatteur' || !ROLE_NAME[role] ? (
            <div className="flex flex-wrap items-center gap-1">
              {badge}
              <NewBadge
                isNew={row.original.isNew}
                arrivedAt={row.original.arrivedAt}
                leftAt={row.original.leftAt}
              />
            </div>
          ) : (
            badge
          )
        })(),
    },
    {
      id: 'pages',
      header: 'Pages',
      cell: ({ row }) => {
        if (row.original.role === 'admin' || row.original.role === 'superadmin')
          return <span className="text-xs text-muted-foreground">toutes</span>
        const items = choices.filter((p) => row.original.pages.includes(p.slug)).map((p) => {
          const Icon = p.icon
          return {
            key: p.slug,
            node: (
              <Badge key={p.slug} variant="outline" className="gap-1 font-normal">
                <Icon className="size-3" /> {p.label}
              </Badge>
            ),
          }
        })
        return items.length ? (
          <BadgeList items={items} />
        ) : (
          <span className="text-xs text-muted-foreground">aucune</span>
        )
      },
    },
    ...modelsColumn,
    {
      // « Créé par » REMISE (retour Benoit 2026-08-03) : savoir qui a ouvert un compte se lit
      // d'un coup d'œil sur la liste — l'historique et la fiche de détail le disent aussi, mais
      // il fallait ouvrir. « Créé le », en revanche, reste hors table : la date brute d'ouverture
      // d'un compte ne se compare pas d'une ligne à l'autre.
      id: 'createdBy',
      accessorFn: (m) => m.createdByName ?? '',
      header: ({ column }) => <Sortable column={column} label="Créé par" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.createdByName ?? '—'}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <RowActions
          member={row.original}
          creators={creators}
          chatters={chatters}
          managers={managers}
          scope={scope}
          viewer={viewer}
          superadmin={superadmin}
        />
      ),
      meta: { align: 'right' },
    },
  ]
}
