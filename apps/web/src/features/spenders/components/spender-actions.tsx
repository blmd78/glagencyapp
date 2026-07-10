'use client'

import { useState, useTransition } from 'react'
import { Send, RotateCcw, Archive, ArchiveRestore } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { addRelance, resetCompteur, setArchived } from '../actions'
import type { SpenderRow } from '../types'

type Target = Pick<SpenderRow, 'creatorId' | 'fanId'>

/** Bouton « Relancé » : note optionnelle → enregistre la relance (compteur R+1). */
export function RelanceButton({ spender }: { spender: SpenderRow }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const res = await addRelance({
        creatorId: spender.creatorId,
        fanId: spender.fanId,
        chatterId: spender.chatterId,
        note: note.trim() || undefined,
      })
      if (!res.success) return setError(res.error)
      setError(null)
      setNote('')
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={spender.grise}>
          <Send className="size-3.5" />
          {spender.grise ? 'Relancé' : 'Relancer'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Relancer {spender.username}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Passe en R{spender.compteurR + 1}. Le spender sera grisé jusqu’à minuit.
          </p>
          <Textarea
            placeholder="Note (optionnel) — ce qui a été dit, la vibe…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <ActionButton pending={pending} onClick={submit} className="self-end gap-1.5">
            <Send className="size-3.5" />
            Enregistrer la relance
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Bouton « Reset compteur » — proposé quand le fan a reconverti. */
export function ResetButton({ target }: { target: Target }) {
  const [pending, startTransition] = useTransition()
  return (
    <ActionButton
      size="sm"
      variant="ghost"
      pending={pending}
      className="gap-1.5 text-muted-foreground"
      onClick={() =>
        startTransition(async () => {
          await resetCompteur({ creatorId: target.creatorId, fanId: target.fanId })
        })
      }
    >
      <RotateCcw className="size-3.5" />
      Reset R
    </ActionButton>
  )
}

/** Bouton archiver (avec confirmation) / désarchiver. */
export function ArchiveButton({ target, archived }: { target: Target; archived: boolean }) {
  const [pending, startTransition] = useTransition()
  const toggle = () =>
    startTransition(async () => {
      await setArchived({ creatorId: target.creatorId, fanId: target.fanId }, !archived)
    })

  if (archived) {
    return (
      <ActionButton size="sm" variant="ghost" pending={pending} onClick={toggle} className="gap-1.5">
        <ArchiveRestore className="size-3.5" />
        Réactiver
      </ActionButton>
    )
  }
  return (
    <ConfirmDialog
      title="Archiver ce spender ?"
      description="Il sortira de la file de relance. Tu pourras le réactiver depuis l’onglet Archive."
      confirmLabel="Archiver"
      destructive={false}
      onConfirm={toggle}
      trigger={
        <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={pending}>
          <Archive className="size-3.5" />
          Archiver
        </Button>
      }
    />
  )
}
