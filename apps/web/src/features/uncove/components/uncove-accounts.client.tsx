'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { HeaderInfo } from '@/components/data-table/header-info'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { addUncoveAccountSchema, type AddUncoveAccountInput } from '../uncove.schema'
import { addUncoveAccount, removeUncoveAccount, reconnectUncoveAccount, setUncoveAccountLink } from '../actions'
import type { CreatorOption, UncoveAccountRow } from '../types'

// Radix Select refuse la chaîne vide comme valeur d'item → sentinelle pour « pas de modèle ».
const NO_CREATOR = 'none'

export function UncoveAccounts({
  accounts,
  creators,
}: {
  accounts: UncoveAccountRow[]
  creators: CreatorOption[]
}) {
  'use no memo'
  const [pending, start] = useTransition()
  const [reconnecting, setReconnecting] = useState<UncoveAccountRow | null>(null)
  const [token, setToken] = useState('')
  const form = useForm<AddUncoveAccountInput>({
    resolver: zodResolver(addUncoveAccountSchema),
    defaultValues: { label: '', token: '' },
  })

  const submit = form.handleSubmit((values) =>
    start(async () => {
      const res = await addUncoveAccount(values)
      if (!res.success) return void toast.error(res.error)
      toast.success('Modèle ajouté.')
      form.reset()
    }),
  )

  const remove = (a: UncoveAccountRow) =>
    start(async () => {
      if (!window.confirm(`Supprimer « ${a.label} » et son relevé ?`)) return
      const res = await removeUncoveAccount({ id: a.id })
      if (!res.success) return void toast.error(res.error)
      toast.success('Modèle supprimé.')
    })

  // Rattachement + « CA hors MyPuls » : un seul geste côté serveur, la valeur non touchée est
  // renvoyée telle quelle (l'action écrit les deux colonnes).
  const saveLink = (a: UncoveAccountRow, patch: { creatorId?: string | null; countsInCa?: boolean }) =>
    start(async () => {
      const res = await setUncoveAccountLink({
        id: a.id,
        creatorId: patch.creatorId === undefined ? a.creatorId : patch.creatorId,
        countsInCa: patch.countsInCa === undefined ? a.countsInCa : patch.countsInCa,
      })
      if (!res.success) return void toast.error(res.error)
      toast.success('Enregistré.')
    })

  const confirmReconnect = () =>
    start(async () => {
      if (!reconnecting) return
      const res = await reconnectUncoveAccount({ id: reconnecting.id, token })
      if (!res.success) return void toast.error(res.error)
      toast.success('Modèle reconnecté.')
      setReconnecting(null)
      setToken('')
    })

  const columns: ColumnDef<UncoveAccountRow>[] = [
    {
      accessorKey: 'label',
      header: ({ column }) => <Sortable column={column} label="Modèle" />,
      cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
    },
    {
      id: 'creator',
      header: () => (
        <span className="inline-flex items-center gap-1.5">
          Modèle CRM
          <HeaderInfo text="Sur quelle modèle imputer ce CA dans l'Overview. Sans rattachement, le CA compte quand même dans le CA total de l'agence — il n'apparaît simplement sur aucune ligne du classement par modèle." />
        </span>
      ),
      cell: ({ row }) => (
        <Select
          value={row.original.creatorId ?? NO_CREATOR}
          onValueChange={(v) => saveLink(row.original, { creatorId: v === NO_CREATOR ? null : v })}
          disabled={pending}
        >
          <SelectTrigger className="h-8 w-52 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CREATOR} className="text-sm text-muted-foreground">
              Aucune
            </SelectItem>
            {creators.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-sm">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: 'countsInCa',
      header: () => (
        <span className="inline-flex items-center gap-1.5">
          CA hors MyPuls
          <HeaderInfo text="Coché : ce CA n'est pas relevé par MyPuls, il s'ajoute au CA de l'agence dans l'Overview (admin). Décoché : le compte reste informatif, visible dans la section Uncove seulement." />
        </span>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={row.original.countsInCa}
            onCheckedChange={(v) => saveLink(row.original, { countsInCa: v === true })}
            disabled={pending}
            aria-label="Compter ce CA dans le CA de l'agence"
          />
          <span className="text-xs text-muted-foreground">
            {row.original.countsInCa ? 'compté dans le CA' : 'informatif'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'uncoveUserId',
      header: 'Identifiant Uncove',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.uncoveUserId}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => (
        <Badge className={cn('text-xs', row.original.status === 'ok' ? STATUS_COLORS.positive : STATUS_COLORS.danger)}>
          {row.original.status === 'ok' ? 'OK' : 'à reconnecter'}
        </Badge>
      ),
    },
    {
      accessorKey: 'lastSyncedAt',
      header: ({ column }) => <Sortable column={column} label="Dernier relevé" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.lastSyncedAt ? new Date(row.original.lastSyncedAt).toLocaleDateString('fr-FR') : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setReconnecting(row.original); setToken('') }} disabled={pending}>
            Reconnecter
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(row.original)} disabled={pending}>
            Supprimer
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajouter un modèle</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5 sm:w-56">
              <Label htmlFor="unc-label">Nom du modèle</Label>
              <Input id="unc-label" placeholder="Alice" {...form.register('label')} />
              {form.formState.errors.label && (
                <span className="text-xs text-destructive">{form.formState.errors.label.message}</span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="unc-token">user_token Uncove</Label>
              <Input id="unc-token" placeholder="eyJhbGci…" {...form.register('token')} />
              {form.formState.errors.token && (
                <span className="text-xs text-destructive">{form.formState.errors.token.message}</span>
              )}
            </div>
            <ActionButton type="submit" pending={pending}>Ajouter</ActionButton>
          </form>
        </CardContent>
      </Card>

      {accounts.length > 0 && (
        <DataTable
          data={accounts}
          columns={columns}
          getRowId={(r) => r.id}
          filterColumnId="label"
          filterPlaceholder="Filtrer par modèle…"
          initialSorting={[{ id: 'label', desc: false }]}
          countLabel={(n) => `${n} modèle${n > 1 ? 's' : ''}`}
        />
      )}

      <Dialog open={!!reconnecting} onOpenChange={(o) => { if (!o) { setReconnecting(null); setToken('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconnecter « {reconnecting?.label} »</DialogTitle>
            <DialogDescription>
              Colle un <code>user_token</code> frais du <strong>même</strong> compte Uncove : il remplace l&apos;ancien
              et repasse le modèle en OK.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unc-reco">Nouveau user_token</Label>
            <Input id="unc-reco" value={token} onChange={(e) => setToken(e.target.value)} placeholder="eyJhbGci…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReconnecting(null); setToken('') }}>Annuler</Button>
            <ActionButton pending={pending} disabled={token.trim().length < 20} onClick={confirmReconnect}>
              Reconnecter
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
