'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, FileText, FileUp } from 'lucide-react'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { DAY_TASK_CATEGORY } from '../day-category'
import { holderMatches, parseTodoFile, periodLength, type ImportTask, type ParsedTodoFile } from '../import-txt'
import type { Urgency } from '../urgency'
import { importTodoFile, type ImportTxtResult } from '../import-txt-actions'

/** « 12/10 » */
const short = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`

const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`

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
 * Le champ fichier natif est CACHÉ, déclenché par une zone d'envoi visible (clic ou glisser-déposer) —
 * même principe que la photo d'un événement Agence (`event-dialog.client.tsx`). Rendu brut, le champ
 * du navigateur se lisait comme du texte : on ne savait pas qu'il fallait cliquer (recette du
 * 2026-10-12).
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
    // Fermer par le code ne passe pas par `onOpenChange` : on vide ici aussi, sinon le bilan
    // remplacerait la zone d'envoi à la réouverture.
    setOpen(false)
    reset()
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
              <Button variant="outline" size="sm" onClick={close}>
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

/** La zone d'envoi : un clic ouvre le sélecteur de fichiers, un fichier glissé dessus est pris tel quel. */
function FileDrop({ onPick }: { onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const file = e.dataTransfer.files[0]
          if (file) onPick(file)
        }}
        className={cn(
          'flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-8 text-center transition-colors',
          'hover:border-muted-foreground/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          over && 'border-primary bg-muted/60',
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <FileUp className="size-5 text-muted-foreground" />
        </span>
        <span className="grid gap-1">
          <span className="text-sm font-medium">Glisse ton fichier .txt ici</span>
          <span className="text-sm text-muted-foreground">ou</span>
        </span>
        <span className={buttonVariants({ variant: 'outline', size: 'sm' })}>Choisir un fichier</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
    </>
  )
}

/** Le fichier choisi, et de quoi en prendre un autre. */
function PickedFile({ name, onPick }: { name: string; onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()}>
        Changer
      </Button>
      <input
        ref={input}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Le format attendu, replié : ceux qui ont déjà le fichier n'en ont pas besoin. */
function FormatHint() {
  const [open, setOpen] = useState(false)
  return (
    <div className="grid gap-2">
      <button
        type="button"
        className="justify-self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Masquer le format' : 'Voir le format attendu'}
      </button>
      {open ? (
        <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {[
            'TO-DO DE PRÉNOM · MODÈLES · 12 → 31 OCTOBRE 2026',
            '=== À CRÉER UNE SEULE FOIS : SECTION RÉCURRENTE « ROUTINE » ===',
            'Matin · Contrôler la nuit',
            '=== LUNDI 12 OCTOBRE ===',
            '[Modèle] Répondre aux messages en attente (1 h)',
          ].join('\n')}
        </pre>
      ) : null}
    </div>
  )
}

/** Une ligne de l'aperçu : un libellé à gauche, ce qui sera écrit à droite. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

/** Ce que l'import va écrire — avant d'écrire. */
function ImportPreview({
  parsed,
  ownerName,
  taskCount,
}: {
  parsed: ParsedTodoFile
  ownerName: string
  taskCount: number
}) {
  if (parsed.errors.length > 0) {
    return (
      <div className="grid gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4 shrink-0" /> Ce fichier ne peut pas être importé
        </p>
        <ul className="grid gap-1 pl-6">
          {parsed.errors.slice(0, 8).map((e) => (
            <li key={`${e.line}:${e.message}`}>
              Ligne {e.line} — {e.message}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const p = parsed.period
  return (
    <div className="grid gap-3">
      {!holderMatches(parsed.holder, ownerName) ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Ce fichier est adressé à « {parsed.holder} ». Vérifie que c’est bien la to-do de {ownerName}.
          </span>
        </p>
      ) : null}
      <div className="divide-y">
        {p ? (
          <Row label="Période">
            du {short(p.from)} au {short(p.to)} · {plural(periodLength(p), 'jour')}
          </Row>
        ) : null}
        <Row label="Tâches">
          {plural(taskCount, 'tâche')} sur {plural(parsed.days.length, 'jour')}
        </Row>
        {parsed.routineSection && parsed.routine.length > 0 ? (
          <Row label="Routine">
            {plural(parsed.routine.length, 'ligne')} chaque jour, dans « {parsed.routineSection} »
          </Row>
        ) : null}
        {parsed.ignored.length > 0 ? (
          <Row label="Non importé">{plural(parsed.ignored.length, 'ligne')}</Row>
        ) : null}
      </div>
      {parsed.routineSection && parsed.routine.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          La routine reviendra chaque jour à partir du {p ? short(p.from) : '—'}. {ownerName} pourra en sauter
          une ligne un jour donné, pas la retirer.
        </p>
      ) : null}
      <TaskList parsed={parsed} />
      {parsed.ignored.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Voir les lignes non importées</summary>
          <ul className="mt-2 grid gap-1">
            {parsed.ignored.map((x) => (
              <li key={x.line}>
                Ligne {x.line} — {x.text} ({x.reason})
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/** La couleur de l'urgence, la même que le liseré des cartes de la To-Do (`.u-<niveau>`). */
const URGENCY_DOT: Record<Urgency, string> = {
  normale: 'bg-blue-500',
  importante: 'bg-orange-600',
  urgente: 'bg-red-500',
}

/** « Lundi 12/10 » */
const dayTitle = (date: string): string => {
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Les groupes d'une liste de tâches, dans l'ordre du fichier. */
function byGroup(tasks: readonly ImportTask[]): { name: string; tasks: ImportTask[] }[] {
  const groups: { name: string; tasks: ImportTask[] }[] = []
  for (const t of tasks) {
    const g = groups.find((x) => x.name === t.category)
    if (g) g.tasks.push(t)
    else groups.push({ name: t.category, tasks: [t] })
  }
  return groups
}

function TaskLine({ task }: { task: ImportTask }) {
  return (
    <li className="flex items-start gap-2">
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', URGENCY_DOT[task.urgency])} aria-hidden />
      <span className="min-w-0">
        {task.label}
        {task.description ? <span className="text-muted-foreground"> · {task.description}</span> : null}
      </span>
    </li>
  )
}

/**
 * L'APERÇU DÉTAILLÉ (demande de Benoit, 2026-10-12) : ce qui sera créé, tâche par tâche, avant
 * d'écrire quoi que ce soit — la routine, puis chaque jour et ses groupes, dans l'ordre du fichier.
 */
function TaskList({ parsed }: { parsed: ParsedTodoFile }) {
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border">
      <div className="divide-y">
        {parsed.routine.length > 0 ? (
          <section className="grid gap-2 px-3 py-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              {parsed.routineSection ?? 'Routine'} · chaque jour
            </h3>
            <ul className="grid gap-1 text-sm">
              {parsed.routine.map((t) => (
                <TaskLine key={t.label} task={t} />
              ))}
            </ul>
          </section>
        ) : null}
        {parsed.days.map((day) => (
          <section key={day.date} className="grid gap-2 px-3 py-3">
            <h3 className="text-xs font-semibold">{dayTitle(day.date)}</h3>
            {day.tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune tâche.</p>
            ) : (
              byGroup(day.tasks).map((g) => (
                <div key={g.name} className="grid gap-1">
                  {g.name !== DAY_TASK_CATEGORY || byGroup(day.tasks).length > 1 ? (
                    <p className="text-xs text-muted-foreground">{g.name}</p>
                  ) : null}
                  <ul className="grid gap-1 text-sm">
                    {g.tasks.map((t) => (
                      <TaskLine key={`${g.name}|${t.label}`} task={t} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

/** Le bilan, une fois écrit. */
function ImportResult({ result }: { result: ImportTxtResult }) {
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="size-4 text-emerald-600" /> Import terminé
      </p>
      <div className="divide-y">
        <Row label="Tâches ajoutées">
          {result.tasksAdded}
          {result.tasksSkipped > 0 ? <span className="font-normal text-muted-foreground"> · {result.tasksSkipped} déjà là</span> : null}
        </Row>
        <Row label="Lignes de routine">
          {result.habitsAdded}
          {result.habitsSkipped > 0 ? <span className="font-normal text-muted-foreground"> · {result.habitsSkipped} déjà là</span> : null}
        </Row>
      </div>
      <p className="text-xs text-muted-foreground">Tu peux relancer le même fichier : rien n’est dupliqué.</p>
    </div>
  )
}
