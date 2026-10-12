'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { isoWeekday } from '@glagency/core'
import { QuickAddTask, type NewTask } from './quick-add-task'
import { DAY_TASK_CATEGORY } from '../day-category'
import { TaskItem } from './task-item'
import type { TodoDay, TodoSection, TodoTask, TodoChatter } from '../types'

/** Une section = une zone de dépôt. Leur feuille l'éclaire avec `.tgroup.over`. */
function SectionGroup({
  day,
  section,
  canWrite,
  onToggle,
  onDelete,
  onAdd,
  onOpen,
  chatters,
  canOrganize,
  onDeleteSection,
}: {
  day: TodoDay
  section: TodoSection
  /** ATTESTER — cocher. Le titulaire seul. */
  canWrite: boolean
  onToggle: (task: TodoTask, done: boolean) => void
  onDelete: (task: TodoTask) => void
  onAdd: (date: string, category: string, task: NewTask) => void
  onOpen: (task: TodoTask, date: string, category: string) => void
  chatters: TodoChatter[]
  /** ORGANISER — ajouter, retirer, remanier. Le titulaire ou son encadrement. */
  canOrganize: boolean
  onDeleteSection: (name: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${day.date}::${section.name}`,
    data: { date: day.date, category: section.name },
  })
  const [adding, setAdding] = useState(false)

  const done = section.tasks.filter((t) => t.done).length

  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'tgroup over' : 'tgroup'}
      data-drop-date={day.date}
      data-drop-cat={section.name}
    >
      <div className="glab">
        <span>{section.name}</span>
        <em>
          {done}/{section.tasks.length}
        </em>
        {canOrganize ? (
          <>
            <button
              type="button"
              className="gadd"
              title={canWrite ? 'Ajouter une tâche ici' : 'Déposer une tâche ici'}
              onClick={() => setAdding(true)}
            >
              +
            </button>
            {/* La STRUCTURE de la semaine s'ouvre à l'encadrement depuis le 2026-09-07
                (`assertCanOrganize`) : un manager qui ne pouvait pas retirer une section ne
                pouvait pas réorganiser la semaine de son sous-manager, seulement la garnir.
                Masqué sur un groupe qui n'est qu'une CATÉGORIE de tâches (« À faire » du
                « + Tâche ») : il n'y a aucune section à retirer, le clic ne ferait rien. */}
            {section.recurring ? (
              <button
                type="button"
                className="gdel"
                title="Retirer la section (ses tâches sont conservées)"
                onClick={() => onDeleteSection(section.name)}
              >
                ✕
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {section.tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          date={day.date}
          category={section.name}
          canWrite={canWrite}
          canOrganize={canOrganize}
          onToggle={onToggle}
          onDelete={onDelete}
          onOpen={onOpen}
        />
      ))}

      {adding && canOrganize ? (
        <QuickAddTask
          chatters={chatters}
          onSubmit={(task) => onAdd(day.date, section.name, task)}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  )
}

/**
 * Une journée de la semaine. `.day` avec ses modificateurs : `.now` aujourd'hui, `.we` le
 * week-end, `.rest` un jour de repos (grisé, comme chez eux).
 */
export function DayColumn({
  day,
  canWrite,
  onToggle,
  onDelete,
  onAdd,
  onOpen,
  chatters,
  canOrganize,
  onDayOff,
  onAddSection,
  onDeleteSection,
  onOpenDay,
}: {
  day: TodoDay
  /** ATTESTER — cocher. Le titulaire seul. */
  canWrite: boolean
  onToggle: (task: TodoTask, done: boolean) => void
  onDelete: (task: TodoTask) => void
  onAdd: (date: string, category: string, task: NewTask) => void
  onOpen: (task: TodoTask, date: string, category: string) => void
  chatters: TodoChatter[]
  /** ORGANISER — le planning de la semaine. Le titulaire ou son encadrement. */
  canOrganize: boolean
  onDayOff: (date: string) => void
  onAddSection: (name: string, weekday: number) => void
  onDeleteSection: (name: string) => void
  /** #162 — ouvre la journée seule, en pop-up. Absent dans la pop-up elle-même. */
  onOpenDay?: (date: string) => void
}) {
  const [addingTask, setAddingTask] = useState(false)
  const [addingSection, setAddingSection] = useState(false)

  // LA JOURNÉE ENTIÈRE est une zone de dépôt, comme chez eux (`zoneOf` : `.tgroup` sinon `.dayb`,
  // todo.html:1592). Seules les sections l'étaient : une journée sans section — ou le vide sous
  // ses groupes — refusait la tâche en silence. Depuis le « + Tâche » du 2026-09-14, les tâches
  // vont dans « À faire », qui n'existe que là où il y en a déjà : semaine du 21/09, 16 journées
  // sur 77 n'avaient plus aucune cible. Sans `category` : la tâche garde la sienne (`onDragEnd`).
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day.date}`, data: { date: day.date } })

  const all = day.sections.flatMap((s) => s.tasks)
  const done = all.filter((t) => t.done).length
  const cls = ['day', day.isToday ? 'now' : '', day.isWeekend ? 'we' : '', day.dayOff ? 'rest' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      <h3>
        {/* Le jour et sa date ouvrent la journée seule (#162) ; le reste de l'en-tête (compteur,
            jour de repos) garde son geste. Même rendu qu'avant : le bouton n'a pas d'habit. */}
        {onOpenDay ? (
          <button
            type="button"
            className="dopen"
            title="Afficher cette journée seule"
            onClick={() => onOpenDay(day.date)}
          >
            {day.weekdayLabel}
            <em>{day.dayLabel}</em>
          </button>
        ) : (
          <>
            {day.weekdayLabel}
            <em>{day.dayLabel}</em>
          </>
        )}
        {all.length > 0 ? (
          <span className="pc">
            {done}/{all.length}
          </span>
        ) : null}
        {canOrganize ? (
          <button
            type="button"
            className={day.dayOff ? 'dayoff on' : 'dayoff'}
            title={day.dayOff ? 'Annuler le jour de repos' : 'Marquer comme jour de repos'}
            onClick={() => onDayOff(day.date)}
          >
            ☾
          </button>
        ) : null}
      </h3>

      <div ref={setNodeRef} className={isOver ? 'dayb over' : 'dayb'} data-drop-date={day.date}>
        {day.sections.length === 0 ? (
          <p className="bnone">Rien de prévu.</p>
        ) : (
          day.sections.map((section) => (
            <SectionGroup
              key={section.name}
              day={day}
              section={section}
              canWrite={canWrite}
              onToggle={onToggle}
              onDelete={onDelete}
              onAdd={onAdd}
              onOpen={onOpen}
              chatters={chatters}
              canOrganize={canOrganize}
              onDeleteSection={onDeleteSection}
            />
          ))
        )}

        {/* UNE action visible par jour : « + Tâche ». Jusqu'au 2026-09-14, le seul bouton de la
            colonne était « + Section » : sur une journée vide, des encadrants y tapaient leur
            tâche et créaient une section RÉCURRENTE vide — sans case à cocher, absente de
            « Pas faites », que seul le ✕ savait retirer (5 en prod ce jour-là). La section reste
            possible, en lien discret, et dit qu'elle revient chaque semaine.
            Le « + Tâche » sert aussi le déposant, qui n'a ainsi aucune structure à créer chez
            quelqu'un d'autre pour y poser une seule tâche. */}
        {canOrganize ? (
          addingTask ? (
            <QuickAddTask
              chatters={chatters}
              onSubmit={(task) => onAdd(day.date, DAY_TASK_CATEGORY, task)}
              onClose={() => setAddingTask(false)}
            />
          ) : addingSection ? (
            <div className="qadd">
              <input
                autoFocus
                placeholder={`Section, revient chaque ${day.weekdayLabel}…`}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setAddingSection(false)
                  if (e.key !== 'Enter') return
                  const value = e.currentTarget.value.trim()
                  if (value) onAddSection(value, isoWeekday(day.date))
                  e.currentTarget.value = ''
                  setAddingSection(false)
                }}
                onBlur={() => setAddingSection(false)}
              />
            </div>
          ) : (
            <div className="addrows">
              <button type="button" className="addrow" onClick={() => setAddingTask(true)}>
                + Tâche
              </button>
              <button
                type="button"
                className="addsec"
                title={`Une section revient chaque ${day.weekdayLabel} — pour une tâche ponctuelle, « + Tâche »`}
                onClick={() => setAddingSection(true)}
              >
                + section récurrente
              </button>
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}

export type DayColumnProps = Parameters<typeof DayColumn>[0]
