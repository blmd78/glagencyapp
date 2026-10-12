'use client'

import { useState, useTransition } from 'react'
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
import { DAY_TASK_CATEGORY } from '../day-category'
import { holderMatches, parseTodoFile, periodLength, type ParsedTodoFile } from '../import-txt'
import { importTodoFile, type ImportTxtResult } from '../import-txt-actions'

/** « 12/10 » */
const short = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`

/**
 * « Importer un fichier » (#163) — remplit la to-do de la personne CHOISIE dans le sélecteur à
 * partir d'un `.txt` (format : `import-txt.ts`). Même facture que « Récupérer mon historique du
 * tracker » (`tracker-import-button.tsx`), son équivalent sur cet écran.
 *
 * Garde-fou demandé par Benoit (2026-10-12) — « s'assurer qu'ils ont bien sélectionné un mec » :
 * sur « Ma semaine », le bouton est inactif ; la pop-up dit en tête dans QUELLE to-do on importe,
 * et avertit si le prénom du fichier n'est pas celui de la personne choisie (sans bloquer : le même
 * prénom peut s'écrire autrement dans le CRM). L'aperçu est lu dans le navigateur ; le serveur
 * relit le fichier lui-même avant d'écrire.
 */
export function ImportTxtButton({ ownerId, ownerName }: { ownerId: string; ownerName: string | null }) {
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

  if (!ownerName) {
    // Le `title` sur une enveloppe : un bouton inactif ne reçoit pas le survol
    // (`disabled:pointer-events-none`), son infobulle ne s'afficherait jamais.
    return (
      <span title="Choisis d’abord la personne dans le sélecteur" className="inline-flex">
        <Button variant="outline" size="sm" disabled>
          <FileUp className="size-3.5" /> Importer un fichier
        </Button>
      </span>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileUp className="size-3.5" /> Importer un fichier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer une to-do</DialogTitle>
          <DialogDescription>
            Dans la to-do de <b className="text-foreground">{ownerName}</b>. Fichier .txt : une ligne par
            tâche, un bloc par jour.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium">C’est fait :</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              <li>
                {result.tasksAdded} tâche{result.tasksAdded > 1 ? 's' : ''} ajoutée{result.tasksAdded > 1 ? 's' : ''}
                {result.tasksSkipped > 0 ? ` (${result.tasksSkipped} déjà là)` : ''}
              </li>
              <li>
                {result.habitsAdded} ligne{result.habitsAdded > 1 ? 's' : ''} de routine
                {result.habitsSkipped > 0 ? ` (${result.habitsSkipped} déjà là)` : ''}
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">Tu peux relancer le même fichier : rien n’est dupliqué.</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <input
              type="file"
              accept=".txt,text/plain"
              aria-label="Fichier .txt de la to-do"
              className="w-full text-sm"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setFileName(file.name)
                setText(await file.text())
              }}
            />
            {parsed ? (
              <ImportPreview parsed={parsed} ownerName={ownerName} taskCount={taskCount} fileName={fileName} />
            ) : null}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button
              size="sm"
              onClick={() => {
                // Fermer par le code ne passe pas par `onOpenChange` : on vide ici aussi, sinon le
                // bilan remplacerait le sélecteur de fichier à la réouverture.
                setOpen(false)
                reset()
              }}
            >
              Fermer
            </Button>
          ) : (
            <ActionButton size="sm" pending={pending} disabled={blocked} onClick={submit}>
              Importer
            </ActionButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Ce que l'import va écrire — avant d'écrire. */
function ImportPreview({
  parsed,
  ownerName,
  taskCount,
  fileName,
}: {
  parsed: ParsedTodoFile
  ownerName: string
  taskCount: number
  fileName: string
}) {
  if (parsed.errors.length > 0) {
    return (
      <div className="space-y-1" role="alert">
        <p className="font-medium text-destructive">{fileName} ne peut pas être importé :</p>
        <ul className="list-disc pl-5 text-destructive">
          {parsed.errors.slice(0, 8).map((e) => (
            <li key={`${e.line}:${e.message}`}>
              ligne {e.line} — {e.message}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const p = parsed.period
  return (
    <div className="space-y-2">
      {!holderMatches(parsed.holder, ownerName) ? (
        <p className="text-amber-600 dark:text-amber-400">
          Ce fichier est adressé à « {parsed.holder} » : vérifie que c’est bien la to-do de {ownerName}.
        </p>
      ) : null}
      <ul className="list-disc pl-5 text-muted-foreground">
        {p ? (
          <li>
            Du {short(p.from)} au {short(p.to)} ({periodLength(p)} jours)
          </li>
        ) : null}
        <li>
          {taskCount} tâche{taskCount > 1 ? 's' : ''} sur {parsed.days.length} jour{parsed.days.length > 1 ? 's' : ''}, dans
          « {DAY_TASK_CATEGORY} »
        </li>
        {parsed.routineSection && parsed.routine.length > 0 ? (
          <li>
            {parsed.routine.length} ligne{parsed.routine.length > 1 ? 's' : ''} de routine dans « {parsed.routineSection} »,
            chaque jour à partir du {p ? short(p.from) : '—'} — {ownerName} pourra en sauter une un jour donné,
            pas les retirer.
          </li>
        ) : null}
      </ul>
      {parsed.ignored.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium">Non importé :</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {parsed.ignored.map((x) => (
              <li key={x.line}>
                ligne {x.line} — {x.text} <span className="text-xs">({x.reason})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
