'use client'

import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateXHandle } from '../actions'

/**
 * Le crayon d'un compte X non identifié au dernier relevé (demande Benoit 2026-09-29 : « qu'il
 * puisse changer pour scrap »). Crayon = celui des notes de sources
 * (`source-note-dialog.client.tsx`), fenêtre au même modèle, réduite à un champ.
 */
export function EditXHandleDialog({
  accountId,
  handle,
  status,
}: {
  accountId: string
  handle: string
  /** « introuvable » ou « suspendu » — le statut du dernier relevé. */
  status: string
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(handle)
  const [pending, start] = useTransition()
  const id = `x-handle-${accountId}`
  const unchanged = value.trim().replace(/^@/, '') === handle

  const save = () =>
    start(async () => {
      const res = await updateXHandle({ accountId, handle: value })
      if (!res.success) return void toast.error(res.error)
      toast.success(`@${res.data.handle} sera cherché au prochain relevé.`)
      setOpen(false)
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        if (o) setValue(handle)
        setOpen(o)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={`Corriger le pseudo @${handle}`}
          title="Corriger le pseudo"
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!unchanged && value.trim()) save()
          }}
        >
          <DialogHeader>
            <DialogTitle>Corriger le pseudo</DialogTitle>
            <DialogDescription>
              @{handle} est {status} sur X au dernier relevé. Mets le pseudo actuel du compte : il
              sera cherché sous ce nom au prochain relevé.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={id}>Pseudo X</Label>
            <Input
              id={id}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <ActionButton type="submit" pending={pending} disabled={unchanged || !value.trim()}>
              Enregistrer
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
