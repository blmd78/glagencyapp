'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { isoWeekday } from '@glagency/core'
import { TaskItem } from './task-item'
import type { TodoDay, TodoSection, TodoTask, TodoChatter } from '../types'

/**
 * Catégorie d'accueil d'une tâche déposée sur une journée qui n'a encore aucune section.
 * Volontairement neutre : la tâche porte déjà son badge « déposée », l'en-tête du groupe n'a pas
 * à le répéter — et si le titulaire a déjà une section de ce nom, le dépôt s'y range.
 */
const DEPOT_CATEGORY = 'À faire'

/** Une section = une zone de dépôt. Leur feuille l'éclaire avec `.tgroup.over`. */
function SectionGroup({
  day,
  section,
  canWrite,
  onToggle,
  onDelete,
  onAdd,
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
  onAdd: (date: string, category: string, label: string, chatterId?: string | null) => void
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
  const [draft, setDraft] = useState('')
  const [withChatter, setWithChatter] = useState('')
  const closeAdd = (): void => {
    setAdding(false)
    setDraft('')
    setWithChatter('')
  }
  const submitAdd = (): void => {
    const value = draft.trim()
    if (!value) return
    onAdd(day.date, section.name, value, withChatter || null)
    closeAdd()
  }

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
                pouvait pas réorganiser la semaine de son sous-manager, seulement la garnir. */}
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
          canOrganize={canOrganize}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}

      {adding && canOrganize ? (
        <div className="qadd">
          <input
            autoFocus
            placeholder="Nouvelle tâche…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeAdd()
              if (e.key !== 'Enter') return
              submitAdd()
            }}
          />
          {/* « Session 1:1 avec (impose un bilan pour cocher) » — viser un chatter transforme la
              tâche : elle ne se cochera qu'en rendant son bilan sur la fiche du chatter. */}
          {chatters.length > 0 ? (
            <select
              className="q1a1"
              value={withChatter}
              onChange={(e) => setWithChatter(e.target.value)}
              title="Session 1:1 avec (impose un bilan pour cocher)"
            >
              <option value="">Aucun 1:1</option>
              {chatters.map((c) => (
                <option key={c.id} value={c.id}>
                  1:1 avec {c.name}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="btn sm" onClick={submitAdd} disabled={!draft.trim()}>
            Ajouter
          </button>
          <button type="button" className="btn sm" onClick={closeAdd}>
            Annuler
          </button>
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
  chatters,
  canOrganize,
  onDayOff,
  onAddSection,
  onDeleteSection,
}: {
  day: TodoDay
  /** ATTESTER — cocher. Le titulaire seul. */
  canWrite: boolean
  onToggle: (task: TodoTask, done: boolean) => void
  onDelete: (task: TodoTask) => void
  onAdd: (date: string, category: string, label: string, chatterId?: string | null) => void
  chatters: TodoChatter[]
  /** ORGANISER — le planning de la semaine. Le titulaire ou son encadrement. */
  canOrganize: boolean
  onDayOff: (date: string) => void
  onAddSection: (name: string, weekday: number) => void
  onDeleteSection: (name: string) => void
}) {
  const [addingSection, setAddingSection] = useState(false)

  // LE DÉPOSANT N'A PAS DE SECTION À REMPLIR. Le bouton « + » d'une tâche vit DANS une section :
  // sur une journée qui n'en a aucune, il ne lui resterait que « + Section » — soit imposer de
  // créer une structure chez quelqu'un d'autre pour y déposer une seule tâche.
  //
  // On lui pose donc un groupe d'accueil vide. C'est licite parce que `category` est du TEXTE
  // LIBRE et non une clé étrangère vers les sections (0127:44-45) : la catégorie d'une tâche
  // déposée existe d'elle-même, et `getTodoWeek` reconstruit les groupes du jour à partir des
  // sections ET des catégories déjà portées par une tâche. Si le titulaire a déjà une section de
  // ce nom, le dépôt s'y range naturellement.
  const sections =
    canOrganize && !canWrite && day.sections.length === 0
      ? [{ name: DEPOT_CATEGORY, recurring: false, tasks: [] }]
      : day.sections

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

      <div className="dayb" data-drop-date={day.date}>
        {sections.length === 0 ? (
          <p className="bnone">Rien de prévu.</p>
        ) : (
          sections.map((section) => (
            <SectionGroup
              key={section.name}
              day={day}
              section={section}
              canWrite={canWrite}
              onToggle={onToggle}
              onDelete={onDelete}
              onAdd={onAdd}
              chatters={chatters}
              canOrganize={canOrganize}
              onDeleteSection={onDeleteSection}
            />
          ))
        )}

        {/* Sans ce bouton, une semaine vierge est un cul-de-sac : pas de section, donc pas de
            bouton « + » de tâche, donc aucun moyen de commencer. */}
        {canOrganize ? (
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
