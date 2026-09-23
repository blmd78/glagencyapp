'use client'

import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { SourceNoteView } from '../types'

/**
 * L'œil : la note dans une fenêtre, jamais en ligne — elle peut faire 20 000 caractères,
 * elle rendrait la liste illisible (demande Benoit 2026-09-23). Le texte défile DANS la fenêtre,
 * le titre et le bouton restent en place. Même panneau de texte que les fiches Infos modèles.
 */
export function SourceNoteReadDialog({
  modele,
  reseau,
  note,
}: {
  modele: string
  reseau: string
  note: SourceNoteView
}) {
  return (
    <Dialog>
      {/* Bouton-icône ENCADRÉ (précédent : `marketing-staff/staff-view.tsx`, même taille) — en
          fantôme, l'œil seul ne se lisait pas comme un bouton (retour Benoit 2026-09-23). */}
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          aria-label={`Consulter la note ${reseau} de ${modele}`}
          title="Consulter la note"
        >
          <Eye className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {modele} · {reseau}
          </DialogTitle>
          <DialogDescription>Mise à jour le {note.updatedLabel}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border bg-muted/30 px-4 py-3">
          <p className="whitespace-pre-line text-sm leading-relaxed">{note.body}</p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Fermer
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
