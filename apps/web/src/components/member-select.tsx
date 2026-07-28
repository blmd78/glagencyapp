'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { Route } from 'next'
import { Combobox } from '@/components/ui/combobox'
import { roleLabel } from '@/lib/roles'
import type { SelectableMember } from '@/lib/types/member'

/**
 * Sentinelle « pas de filtre », PRIVÉE au composant : jamais un uuid, donc aucune collision
 * possible avec un `profiles.id`, et jamais écrite dans l'URL (la choisir SUPPRIME `?membre=`).
 * Les appelants expriment « pas de filtre » par `value={null}` — ils n'ont pas à la connaître.
 */
const ALL = 'tous'

/**
 * LE sélecteur de personne des pages Planning et Dashboard (`?membre=`). Factorisation de
 * `features/planning/components/member-select.tsx` et `features/reports/components/
 * reports-member-select.tsx`, qui étaient le même fichier à un flag près — même convention que
 * `url-select.tsx` (les deux features restent indépendantes, elles ne dépendent que de
 * `components/`).
 *
 * Écrit en `replace` + `scroll: false` et préserve les autres paramètres d'URL (`?vue=` en
 * particulier, guidelines §6). La VALIDATION de `?membre=` reste serveur : la page vérifie
 * l'appartenance à la liste avant de repasser `value`.
 */
export function MemberSelect({
  members,
  value,
  allowAll = false,
}: {
  members: SelectableMember[]
  /** Personne visée, ou `null` = aucun filtre (affiche « Tous les membres »). */
  value: string | null
  /** Propose « Tous les membres ». Faux là où « tous » n'a pas de sens (cible d'une to-do). */
  allowAll?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const select = (id: string) => {
    const params = new URLSearchParams(searchParams)
    if (id === ALL) params.delete('membre')
    else params.set('membre', id)
    const query = params.toString()
    // `?membre=` construit dynamiquement → pas un href statique connu de typedRoutes
    // (convention `date-range-picker.tsx`).
    startTransition(() =>
      router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false }),
    )
  }

  return (
    <Combobox
      value={value ?? ALL}
      onChange={select}
      className={pending ? 'w-52 opacity-60' : 'w-52'}
      placeholder="Choisir un membre…"
      searchPlaceholder="Rechercher un membre…"
      options={[
        ...(allowAll ? [{ value: ALL, label: 'Tous les membres' }] : []),
        ...members.map((m) => {
          const suffix = roleLabel(m.role)
          return { value: m.id, label: suffix ? `${m.name} · ${suffix}` : m.name }
        }),
      ]}
    />
  )
}
