'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { parseTodoFile, type ParsedTodoFile } from '../import-txt'
import { importTodoFile, type ImportTxtResult } from '../import-txt-actions'
import { FileDrop, FormatHint, PickedFile } from './import-file-drop'
import { ImportPreview, ImportResult, plural } from './import-txt-preview'

/**
 * « Importer un fichier » (#163) — remplit la to-do de la personne CHOISIE dans le sélecteur à
 * partir d'un `.txt` (format : `import-txt.ts`).
 *
 * Garde-fou demandé par Benoit (2026-10-12) — « s'assurer qu'ils ont bien sélectionné un mec » :
 * le bouton n'existe que sur la semaine d'une personne choisie (la page ne le rend pas sur « Ma
 * semaine ») ; la pop-up dit en tête dans QUELLE to-do on importe, et avertit si le prénom du
 * fichier n'est pas celui de la personne choisie (sans bloquer : le même prénom peut s'écrire
 * autrement dans le CRM). L'aperçu est lu dans le navigateur ; le serveur relit le fichier lui-même
 * avant d'écrire.
 *
 * La zone d'envoi vit dans `import-file-drop.tsx`, l'aperçu et le bilan dans `import-txt-preview.tsx`.
 */
export function ImportTxtButton({ ownerId, ownerName }: { ownerId: string; ownerName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ImportTxtResult | null>(null)
  const [pending, start] = useTransition()

  const parsed: ParsedTodoFile | null = text ? parseTodoFile(text) : null
  const taskCount = parsed ? parsed.days.reduce((n, d) => n + d.tasks.length, 0) : 0
  const blocked = !parsed || parsed.errors.length > 0 || (taskCount === 0 && parsed.routine.length === 0)

  const reset = (): void => {
    setText('')
    setFileName('')
    setResult(null)
  }

  const read = async (file: File): Promise<void> => {
    setFileName(file.name)
    setText(await file.text())
  }

  const submit = (): void => {
    start(async () => {
      const r = await importTodoFile({ ownerId, text })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setResult(r.data)
      toast.success('To-do importée')
      router.refresh()
    })
  }

  const close = (): void => {
    // Pendant l'envoi, on reste : l'action irait au bout quand même, et son bilan arriverait dans
    // une pop-up déjà vidée. Fermer par le code ne passe pas par `onOpenChange` : on vide ici aussi.
    if (pending) return
    setOpen(false)
    reset()
  }

  // Un fichier lâché À CÔTÉ de la zone d'envoi (fond assombri, reste de la pop-up) serait ouvert par
  // le navigateur, qui quitterait l'app. Seule la zone le prend ; ailleurs, le dépôt ne fait rien.
  useEffect(() => {
    if (!open) return
    const stop = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setOpen(true)
        else close()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileUp className="size-3.5" /> Importer un fichier
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importer une to-do</DialogTitle>
          <DialogDescription>
            Dans la to-do de <b className="font-semibold text-foreground">{ownerName}</b>.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <ImportResult result={result} />
        ) : parsed ? (
          <div className="grid gap-4">
            <PickedFile name={fileName} onPick={read} />
            <ImportPreview parsed={parsed} ownerName={ownerName} taskCount={taskCount} />
          </div>
        ) : (
          <div className="grid gap-3">
            <FileDrop onPick={read} />
            <FormatHint />
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button size="sm" onClick={close}>
              Fermer
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled={pending} onClick={close}>
                Annuler
              </Button>
              <ActionButton size="sm" pending={pending} disabled={blocked} onClick={submit}>
                {blocked || taskCount === 0 ? 'Importer' : `Importer ${plural(taskCount, 'tâche')}`}
              </ActionButton>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
