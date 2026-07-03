'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Loader2, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { PAGE_CHOICES } from '@/config/workspaces'
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

/** Colonne Actions : Modifier (dialog) + Supprimer (confirmation) — admins non éditables. */
function RowActions({ member, creators }: { member: Member; creators: { id: string; name: string }[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (member.role === 'admin') return null

  // Le dialog reste OUVERT tant que la suppression n'a pas réussi : un échec s'affiche
  // dedans au lieu de disparaître silencieusement (Result ignoré = admin qui croit à un bug).
  const remove = (e: React.MouseEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await deleteMember(member.id)
      if (!res.success) {
        setError(res.error)
        return
      }
      setConfirmOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex justify-end gap-1.5">
      <MemberDialog
        member={member}
        creators={creators}
        trigger={
          <Button variant="outline" size="sm">
            <Pencil className="size-3.5" /> Modifier
          </Button>
        }
      />
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {member.displayName} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Son compte et ses accès sont supprimés définitivement — il ne pourra plus se
              connecter. Les données du CRM ne sont pas touchées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 text-white hover:bg-red-700">
              {pending ? 'Suppression…' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
}: {
  members: Member[]
  creators: { id: string; name: string }[]
}) {
  const creatorName = new Map(creators.map((c) => [c.id, c.name]))

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
        (getValue() as string) === 'admin' ? (
          <Badge className={cn('gap-1 text-xs', STATUS_COLORS.info)}>
            <ShieldCheck className="size-3" /> Admin
          </Badge>
        ) : (
          <Badge className={cn('text-xs', STATUS_COLORS.neutral)}>User</Badge>
        ),
    },
    {
      id: 'pages',
      header: 'Pages',
      cell: ({ row }) => {
        if (row.original.role === 'admin')
          return <span className="text-xs text-muted-foreground">toutes</span>
        const items = PAGE_CHOICES.filter((p) => row.original.pages.includes(p.slug)).map((p) => {
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
    {
      id: 'models',
      header: 'Modèles',
      cell: ({ row }) => {
        if (row.original.role === 'admin')
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
      cell: ({ row }) => <RowActions member={row.original} creators={creators} />,
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
    />
  )
}
