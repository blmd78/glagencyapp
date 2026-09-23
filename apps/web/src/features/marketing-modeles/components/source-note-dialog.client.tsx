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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { saveSourceNote } from '../actions'
import { NOTE_MAX } from '../source-note.schema'
import type { SourceNote } from '../types'

/**
 * Le crayon d'une source (modèle × réseau) et sa modale : un grand bloc de texte libre
 * (demande Benoit 2026-09-23). Crayon = celui des VA (`va-columns.tsx`), modale = celle du
 * signalement (`report-dialog.tsx`), en plus large — c'est un bloc, pas une phrase.
 *
 * Le crayon passe au premier plan quand une note existe : sans l'ouvrir, on sait où il y a
 * quelque chose à lire.
 */
export function SourceNoteDialog({
  creatorId,
  modele,
  groupKey,
  reseau,
  note,
}: {
  creatorId: string
  modele: string
  groupKey: string
  reseau: string
  note: SourceNote | undefined
}) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState(note?.body ?? '')
  const [pending, start] = useTransition()
  const id = `note-${creatorId}-${groupKey}`

  const save = () =>
    start(async () => {
      const res = await saveSourceNote({ creatorId, groupKey, body })
      if (!res.success) return void toast.error(res.error)
      toast.success(body.trim() ? 'Note enregistrée.' : 'Note supprimée.')
      setOpen(false)
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        // Rouvrir repart de la note ENREGISTRÉE, pas d'un brouillon abandonné.
        if (o) setBody(note?.body ?? '')
        setOpen(o)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-7', note ? 'text-foreground' : 'text-muted-foreground')}
          aria-label={`${note ? 'Modifier' : 'Ajouter'} la note ${reseau} de ${modele}`}
          title={note ? 'Voir ou modifier la note' : 'Ajouter une note'}
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {modele} · {reseau}
          </DialogTitle>
          <DialogDescription>
            Tout ce qu’il faut savoir sur cette source : comptes, consignes, historique…
            {note && ` Modifiée le ${new Date(note.updatedAt).toLocaleDateString('fr-FR')}.`}
            <span className="mt-1 block">
              Visible par les chatteurs de {modele} qui ont la page Équipe › Sources de trafic.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={id}>Note</Label>
          <Textarea
            id={id}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            maxLength={NOTE_MAX}
            disabled={pending}
            className="min-h-80"
          />
          <span className="text-right text-xs text-muted-foreground tabular-nums">
            {body.length.toLocaleString('fr-FR')} / {NOTE_MAX.toLocaleString('fr-FR')}
          </span>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Annuler
          </Button>
          <ActionButton pending={pending} onClick={save}>
            Enregistrer
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
