'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { Route } from 'next'
import { Combobox } from '@/components/ui/combobox'
import type { PlanningMember } from '../types'

/**
 * Sélecteur de personne COMMUN aux deux onglets (planning + to-do) — rendu au-dessus de
 * `Tabs`, qui démonte l'onglet inactif. Préserve tous les paramètres d'URL existants
 * (`?vue=` en particulier) et écrit en `replace` + `scroll: false` (guidelines §6).
 */
export function MemberSelect({ members, value }: { members: PlanningMember[]; value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const select = (id: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('membre', id)
    // `?membre=` construit dynamiquement → pas un href statique connu de typedRoutes
    // (convention `date-range-picker.tsx`).
    startTransition(() =>
      router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false }),
    )
  }

  return (
    <Combobox
      value={value}
      onChange={select}
      className={pending ? 'w-52 opacity-60' : 'w-52'}
      placeholder="Choisir un membre…"
      searchPlaceholder="Rechercher un membre…"
      options={members.map((m) => ({
        value: m.id,
        label:
          m.role === 'manager'
            ? `${m.name} · manager`
            : m.role === 'sous-manager'
              ? `${m.name} · sous-manager`
              : m.role === 'admin'
                ? `${m.name} · admin`
                : m.role === 'superadmin'
                  ? `${m.name} · propriétaire`
                  : m.name,
      }))}
    />
  )
}
