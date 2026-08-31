'use client'

import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { Combobox } from '@/components/ui/combobox'

/**
 * Le sélecteur de compte de la barre de To-Do — même rôle que le `<select>` du tracker d'origine
 * (todo.html:578), mais avec NOTRE Combobox (recherche intégrée) plutôt que le natif. Réservé aux
 * admins : il permet d'ouvrir la to-do de n'importe quel encadrant.
 *
 * Client (il navigue au choix). « Ma semaine » en tête, puis chaque encadrant.
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
  const options = [
    { value: viewerId, label: 'Ma semaine' },
    ...people.filter((p) => p.id !== viewerId).map((p) => ({ value: p.id, label: p.name })),
  ]
  return (
    <Combobox
      className="w-56"
      options={options}
      value={current}
      placeholder="Choisir un compte…"
      searchPlaceholder="Rechercher un compte…"
      onChange={(v) => {
        // Sa propre semaine → pas de `?owner=`. Sinon on cible la personne choisie.
        const q = v === viewerId ? `week=${week}` : `week=${week}&owner=${v}`
        router.push(`/chatter/presence/todo?${q}` as Route)
      }}
    />
  )
}
