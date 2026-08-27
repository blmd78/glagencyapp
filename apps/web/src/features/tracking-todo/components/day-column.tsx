'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { isoWeekday } from '@glagency/core'
import { TaskItem } from './task-item'
import type { TodoDay, TodoSection, TodoTask } from '../types'

/** Une section = une zone de dépôt. Leur feuille l'éclaire avec `.tgroup.over`. */
function SectionGroup({
  day,
  section,
  canWrite,
  onToggle,
  onDelete,
  onAdd,
  onDeleteSection,
}: {
  day: TodoDay
  section: TodoSection
  canWrite: boolean
  onToggle: (task: TodoTask, done: boolean) => void
  onDelete: (task: TodoTask) => void
  onAdd: (date: string, category: string, label: string) => void
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
        {canWrite ? (
          <>
            <button
              type="button"
              className="gadd"
              title="Ajouter une tâche ici"
              onClick={() => setAdding(true)}
            >
              +
            </button>
            <button
              type="button"
              className="gdel"
              title="Retirer la section (ses tâches sont conservées)"
              onClick={() => onDeleteSection(section.name)}
            >
              ✕
            </button>
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
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}

      {adding ? (
        <div className="qadd">
          <input
            autoFocus
            placeholder="Nouvelle tâche…"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAdding(false)
              if (e.key !== 'Enter') return
              const value = e.currentTarget.value.trim()
              if (value) onAdd(day.date, section.name, value)
              e.currentTarget.value = ''
              setAdding(false)
            }}
            onBlur={() => setAdding(false)}
          />
        </div>
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
  onDayOff,
  onAddSection,
  onDeleteSection,
}: {
  day: TodoDay
  canWrite: boolean
  onToggle: (task: TodoTask, done: boolean) => void
  onDelete: (task: TodoTask) => void
  onAdd: (date: string, category: string, label: string) => void
  onDayOff: (date: string) => void
  onAddSection: (name: string, weekday: number) => void
  onDeleteSection: (name: string) => void
}) {
  const [addingSection, setAddingSection] = useState(false)
  const all = day.sections.flatMap((s) => s.tasks)
  const done = all.filter((t) => t.done).length
  const cls = ['day', day.isToday ? 'now' : '', day.isWeekend ? 'we' : '', day.dayOff ? 'rest' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      <h3>
        {day.weekdayLabel}
        <em>{day.dayLabel}</em>
        {all.length > 0 ? (
          <span className="pc">
            {done}/{all.length}
          </span>
        ) : null}
        {canWrite ? (
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

      <div className="dayb" data-drop-date={day.date}>
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
              onDeleteSection={onDeleteSection}
            />
          ))
        )}

        {/* Sans ce bouton, une semaine vierge est un cul-de-sac : pas de section, donc pas de
            bouton « + » de tâche, donc aucun moyen de commencer. */}
        {canWrite ? (
          addingSection ? (
            <div className="qadd">
              <input
                autoFocus
                placeholder="Nom de la section…"
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
            <button type="button" className="addrow" onClick={() => setAddingSection(true)}>
              + Section
            </button>
          )
        ) : null}
      </div>
    </div>
  )
}
