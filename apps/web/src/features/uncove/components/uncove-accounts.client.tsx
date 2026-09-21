'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import { Badge } from '@/components/ui/badge'
import { addUncoveAccountSchema, type AddUncoveAccountInput } from '../uncove.schema'
import { addUncoveAccount, removeUncoveAccount, reconnectUncoveAccount } from '../actions'
import type { UncoveAccountRow } from '../types'

export function UncoveAccounts({ accounts }: { accounts: UncoveAccountRow[] }) {
  'use no memo'
  const [pending, start] = useTransition()
  const form = useForm<AddUncoveAccountInput>({
    resolver: zodResolver(addUncoveAccountSchema),
    defaultValues: { label: '', token: '' },
  })

  const submit = form.handleSubmit((values) =>
    start(async () => {
      const res = await addUncoveAccount(values)
      if (!res.success) return void toast.error(res.error)
      toast.success('Compte ajouté.')
      form.reset()
    }),
  )

  const remove = (id: string, label: string) =>
    start(async () => {
      if (!window.confirm(`Supprimer le compte « ${label} » et son relevé ?`)) return
      const res = await removeUncoveAccount({ id })
      if (!res.success) return void toast.error(res.error)
      toast.success('Compte supprimé.')
    })

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-1">
          <Input placeholder="Nom (ex. Alice)" className="sm:w-48" {...form.register('label')} />
          {form.formState.errors.label && (
            <span className="text-xs text-destructive">{form.formState.errors.label.message}</span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Input placeholder="user_token Uncove (collé depuis le navigateur)" {...form.register('token')} />
          {form.formState.errors.token && (
            <span className="text-xs text-destructive">{form.formState.errors.token.message}</span>
          )}
        </div>
        <ActionButton type="submit" pending={pending}>Ajouter</ActionButton>
      </form>

      {accounts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <span className="font-medium">{a.label}</span>
              <span className="text-xs text-muted-foreground">{a.uncoveUserId}</span>
              {a.status === 'reconnect' ? (
                <Badge variant="destructive">à reconnecter</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {a.lastSyncedAt ? `relevé ${new Date(a.lastSyncedAt).toLocaleDateString('fr-FR')}` : 'jamais relevé'}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {a.status === 'reconnect' && <ReconnectForm id={a.id} pending={pending} start={start} />}
                <Button variant="ghost" size="sm" onClick={() => remove(a.id, a.label)} disabled={pending}>
                  Supprimer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReconnectForm({
  id,
  pending,
  start,
}: {
  id: string
  pending: boolean
  start: (fn: () => Promise<void>) => void
}) {
  const [token, setToken] = useState('')
  return (
    <div className="flex items-center gap-2">
      <Input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="nouveau user_token"
        className="w-56"
      />
      <ActionButton
        size="sm"
        pending={pending}
        disabled={token.trim().length < 20}
        onClick={() =>
          start(async () => {
            const res = await reconnectUncoveAccount({ id, token })
            if (!res.success) return void toast.error(res.error)
            toast.success('Compte reconnecté.')
            setToken('')
          })
        }
      >
        Reconnecter
      </ActionButton>
    </div>
  )
}
