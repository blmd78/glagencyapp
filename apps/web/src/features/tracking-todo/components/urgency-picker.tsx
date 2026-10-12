'use client'

import { URGENCIES, URGENCY_LABEL, type Urgency } from '../urgency'

/**
 * Le choix de l'urgence (#160) — trois pastilles nommées, la même couleur que le liseré de la
 * carte (`.u-<niveau>` dans `tracker-theme.css`). Un groupe radio : un seul niveau, toujours un.
 * Le même composant à la saisie rapide, dans la pop-up d'une tâche et sur une habitude.
 */
export function UrgencyPicker({ value, onChange }: { value: Urgency; onChange: (u: Urgency) => void }) {
  return (
    <div className="urg" role="radiogroup" aria-label="Urgence">
      {URGENCIES.map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={value === u}
          className={`u-${u}`}
          onClick={() => onChange(u)}
        >
          <span className="dot" aria-hidden />
          {URGENCY_LABEL[u]}
        </button>
      ))}
    </div>
  )
}
