'use client'

import { useState } from 'react'
import { UrgencyPicker } from './urgency-picker'
import type { TodoChatter } from '../types'
import { DEFAULT_URGENCY, type Urgency } from '../urgency'

/** Ce que la saisie rapide transmet (#160) : titre, description facultative, urgence, 1:1. */
export interface NewTask {
  label: string
  description: string
  urgency: Urgency
  chatterId: string | null
}

/**
 * Saisie rapide d'une tâche — la même pour le « + » d'une section et le « + Tâche » d'une journée.
 * Démontée à la fermeture : le brouillon, l'urgence et le 1:1 repartent à vide d'eux-mêmes.
 *
 * Depuis le #160 : un TITRE (obligatoire, Entrée suffit toujours à valider), une description
 * facultative et l'urgence — Normale par défaut, donc la saisie d'un titre seul reste un geste.
 */
export function QuickAddTask({
  chatters,
  onSubmit,
  onClose,
}: {
  chatters: TodoChatter[]
  onSubmit: (task: NewTask) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState<Urgency>(DEFAULT_URGENCY)
  const [withChatter, setWithChatter] = useState('')
  const submit = (): void => {
    const value = draft.trim()
    if (!value) return
    onSubmit({ label: value, description: description.trim(), urgency, chatterId: withChatter || null })
    onClose()
  }

  return (
    <div className="qadd">
      <input
        autoFocus
        placeholder="Titre de la tâche…"
        maxLength={200}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key !== 'Enter') return
          submit()
        }}
      />
      <textarea
        rows={2}
        placeholder="Description (facultative)"
        maxLength={2000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      />
      <UrgencyPicker value={urgency} onChange={setUrgency} />
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
      <button type="button" className="btn sm" onClick={submit} disabled={!draft.trim()}>
        Ajouter
      </button>
      <button type="button" className="btn sm" onClick={onClose}>
        Annuler
      </button>
    </div>
  )
}
