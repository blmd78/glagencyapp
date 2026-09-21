'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { addUncoveAccountSchema, type AddUncoveAccountInput } from '../uncove.schema'
import { addUncoveAccount, removeUncoveAccount, reconnectUncoveAccount } from '../actions'
import type { UncoveAccountRow } from '../types'

export function UncoveAccounts({ accounts }: { accounts: UncoveAccountRow[] }) {
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

  const confirmReconnect = () =>
    start(async () => {
      if (!reconnecting) return
      const res = await reconnectUncoveAccount({ id: reconnecting.id, token })
      if (!res.success) return void toast.error(res.error)
      toast.success('Modèle reconnecté.')
      setReconnecting(null)
      setToken('')
    })

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modèle</TableHead>
              <TableHead>Identifiant Uncove</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dernier relevé</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.label}</TableCell>
                <TableCell className="text-muted-foreground">{a.uncoveUserId}</TableCell>
                <TableCell>
                  <Badge className={cn('text-xs', a.status === 'ok' ? STATUS_COLORS.positive : STATUS_COLORS.danger)}>
                    {a.status === 'ok' ? 'OK' : 'à reconnecter'}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleDateString('fr-FR') : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setReconnecting(a); setToken('') }} disabled={pending}>
                      Reconnecter
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(a)} disabled={pending}>
                      Supprimer
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
