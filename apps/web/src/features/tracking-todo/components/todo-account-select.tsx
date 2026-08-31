'use client'

import { useRouter } from 'next/navigation'
import type { Route } from 'next'

/**
 * Le sélecteur de compte de la barre de To-Do — un vrai menu déroulant, comme le tracker d'origine
 * (`<select onchange="go('/todo?...&compte='+this.value)">`, todo.html). Réservé aux admins : il
 * permet d'ouvrir la to-do de n'importe quel encadrant.
 *
 * Client (il navigue au `change`) ; le rendu natif est stylé par `.trk select` du thème tracker,
 * identique au leur.
 */
export function TodoAccountSelect({
  week,
  viewerId,
  current,
  people,
}: {
  week: string
  viewerId: string
  /** Compte affiché : `owner` de l'URL, ou soi-même. */
  current: string
  people: { id: string; name: string }[]
}) {
  const router = useRouter()
  return (
    <select
      value={current}
      onChange={(e) => {
        const v = e.target.value
        // Sa propre semaine → pas de `?owner=`. Sinon on cible la personne choisie.
        const q = v === viewerId ? `week=${week}` : `week=${week}&owner=${v}`
        router.push(`/chatter/presence/todo?${q}` as Route)
      }}
    >
      <option value={viewerId}>Ma semaine</option>
      {people
        .filter((p) => p.id !== viewerId)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  )
}
