'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { DAY_TASK_CATEGORY } from '../day-category'
import { holderMatches, periodLength, type ImportTask, type ParsedTodoFile } from '../import-txt'
import type { ImportTxtResult } from '../import-txt-actions'

/** « 12/10 » */
const short = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`

export const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`

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
export function ImportPreview({
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
          La routine reviendra chaque jour {p ? `du ${short(p.from)} au ${short(p.to)}` : 'sur la période'}, puis s’arrêtera. {ownerName} pourra en sauter
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
      {/* La pastille de la To-Do elle-même (`.trk .udot` + `.u-<niveau>`, tracker-theme.css) : une
          seule source pour les couleurs. `.trk` autour, la pop-up vivant hors de la page du tracker. */}
      <span className="trk mt-0.5 inline-flex shrink-0" aria-hidden>
        <span className={`udot u-${task.urgency}`} />
      </span>
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
export function ImportResult({ result }: { result: ImportTxtResult }) {
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
