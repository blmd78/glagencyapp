'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { TodoHabit } from '../types'
import type { Urgency } from '../urgency'
import { UrgencyPicker } from './urgency-picker'

/**
 * Modifier une habitude (#160) — son intitulé, sa description et son urgence. Remplace le champ de
 * renommage : un seul champ ne suffisait plus. Les occurrences déjà créées gardent ce qu'elles
 * avaient ; seules les suivantes reprennent le gabarit (`updateHabit`).
 */
export function HabitEditor({
  habit,
  onSave,
  onCancel,
}: {
  habit: TodoHabit
  onSave: (v: { label: string; description: string; urgency: Urgency }) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(habit.label)
  const [description, setDescription] = useState(habit.description)
  const [urgency, setUrgency] = useState<Urgency>(habit.urgency)

  const save = (): void => {
    const v = label.trim()
    if (!v) {
      toast.error('Il faut un intitulé.')
      return
    }
    onSave({ label: v, description: description.trim(), urgency })
  }

  return (
    <span className="hedit">
      <input
        autoFocus
        aria-label="Intitulé"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter') save()
        }}
      />
      <textarea
        rows={2}
        aria-label="Description"
        placeholder="Description (facultative)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <UrgencyPicker value={urgency} onChange={setUrgency} />
      <span className="hact">
        <button type="button" className="btn sm" onClick={save}>
          Enregistrer
        </button>
        <button type="button" className="btn sm btn-ghost" onClick={onCancel}>
          Annuler
        </button>
      </span>
    </span>
  )
}
