'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Pencil, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { MKT_PAGE_CHOICES, PAGE_CHOICES } from '@/config/workspaces'
import { deleteMember } from '../actions'
import { MemberDialog } from './member-dialog'
import type { Member } from '../types'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

/**
 * Colonne Actions : Modifier (dialog) + Supprimer (ConfirmDialog). Admins jamais
 * éditables ici ; un manager n'agit que sur les comptes user — les siens, sa vue étant
 * déjà filtrée par la RLS — et jamais sur sa propre ligne (rôle manager).
 */
function RowActions({
  member,
  creators,
  managers,
  scope,
  viewer,
  superadmin,
}: {
  member: Member
  creators: { id: string; name: string }[]
  managers: { id: string; name: string }[]
  scope: 'chatter' | 'marketing'
  viewer: 'admin' | 'manager'
  /** Propriétaire : seul à pouvoir gérer les fiches admin. */
  superadmin: boolean
}) {
  if (member.role === 'superadmin') return null
  if (member.role === 'admin' && !superadmin) return null
  if (viewer === 'manager' && member.role !== 'chatteur') return null

  return (
    <div className="flex justify-end gap-1.5">
      <MemberDialog
        member={member}
        creators={creators}
        managers={managers}
        scope={scope}
        viewer={viewer}
        superadmin={superadmin}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Modifier ${member.displayName}`}
          >
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      {/* onConfirm renvoie l'erreur (string) en cas d'échec → le dialog reste ouvert et l'affiche. */}
      <ConfirmDialog
        title={`Supprimer ${member.displayName} ?`}
        description="Son compte et ses accès sont supprimés définitivement — il ne pourra plus se connecter. Les données du CRM ne sont pas touchées."
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-red-600 hover:text-red-700"
            aria-label={`Supprimer ${member.displayName}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        }
        onConfirm={async () => {
          const res = await deleteMember(member.id)
          if (!res.success) {
            toast.error(res.error)
            return res.error
          }
          toast.success('Membre supprimé')
        }}
      />
    </div>
  )
}

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

export function MembersTable({
  members,
  creators,
  scope = 'chatter',
  viewer = 'admin',
  superadmin = false,
}: {
  members: Member[]
  creators: { id: string; name: string }[]
  scope?: 'chatter' | 'marketing'
  viewer?: 'admin' | 'manager'
  /** Propriétaire : option rôle Admin + gestion des fiches admin. */
  superadmin?: boolean
}) {
  const creatorName = new Map(creators.map((c) => [c.id, c.name]))
  const choices = scope === 'marketing' ? MKT_PAGE_CHOICES : PAGE_CHOICES
  // Managers rattachables (sélecteur admin du dialog) — dérivés de la liste courante.
  const managers = members
    .filter((m) => m.role === 'manager' || m.role === 'sous-manager')
    .map((m) => ({ id: m.id, name: m.displayName }))

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

  const columns: ColumnDef<Member>[] = [
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
            <div className="truncate font-medium">{row.original.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: ({ column }) => <Sortable column={column} label="Rôle" />,
      cell: ({ getValue }) =>
        (getValue() as string) === 'superadmin' ? (
          <Badge className={cn('gap-1 text-xs', STATUS_COLORS.info)}>
            <ShieldCheck className="size-3" /> Superadmin
          </Badge>
        ) : (getValue() as string) === 'admin' ? (
          <Badge className={cn('gap-1 text-xs', STATUS_COLORS.info)}>
            <ShieldCheck className="size-3" /> Admin
          </Badge>
        ) : (getValue() as string) === 'manager' ? (
          <Badge className={cn('text-xs', STATUS_COLORS.positive)}>Manager</Badge>
        ) : (getValue() as string) === 'sous-manager' ? (
          <Badge className={cn('text-xs', STATUS_COLORS.positive)}>Sous-manager</Badge>
        ) : (
          <Badge className={cn('text-xs', STATUS_COLORS.neutral)}>Chatteur</Badge>
        ),
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
      accessorKey: 'createdAt',
      header: ({ column }) => <Sortable column={column} label="Créé le" className="justify-end" />,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-muted-foreground">
          {new Date(getValue() as string).toLocaleDateString('fr-FR')}
        </span>
      ),
      meta: { align: 'right' },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <RowActions
          member={row.original}
          creators={creators}
          managers={managers}
          scope={scope}
          viewer={viewer}
          superadmin={superadmin}
        />
      ),
      meta: { align: 'right' },
    },
  ]

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
