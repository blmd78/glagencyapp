'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * Sélecteur d'URL PARTAGÉ (Tracker + Rapport du soir) — LE composant unique pour caler une page sur
 * une ancre temporelle via un paramètre d'URL (`?day=` ou `?month=`, selon `param`). Factorisation
 * de `DaySelect`/`MonthSelect` (mêmes classes/format, même API) : choisir une valeur pousse
 * `?<param>=` → la page (Server Component) se recharge sur cette valeur.
 *
 * Navigation : par DÉFAUT `UrlSelect` la gère lui-même et grise son propre `<Select>` pendant le
 * chargement (cas Rapport). Un appelant qui doit RÉAGIR à la navigation (le Tracker grise son bloc de
 * saisie pendant le chargement) passe `onSelect` : c'est alors LUI qui pousse `?<param>=` avec sa
 * propre transition — `UrlSelect` ne double PAS la navigation (l'interne n'est plus appelé) et son
 * `disabled` vient de l'appelant.
 */
export function UrlSelect({
  param,
  value,
  options,
  onSelect,
  disabled,
  className,
}: {
  /** Paramètre d'URL piloté : `day` (mono-jour) ou `month` (1er du mois). */
  param: 'day' | 'month'
  value: string
  options: { value: string; label: string }[]
  /** Fourni = l'appelant gère la navigation ET son `pending` (via `disabled`) ; absent = navigation interne. */
  onSelect?: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  // Navigation interne (défaut) : pose `param` dans les searchParams puis push, sous transition.
  const select = (next: string) => {
    const params = new URLSearchParams(searchParams)
    params.set(param, next)
    // Route construite dynamiquement (query only) → cast (pas un href statique connu de typedRoutes,
    // convention `period-toggle.tsx`).
    startTransition(() => router.push(`?${params.toString()}` as Route))
  }
  const handleChange = onSelect ?? select
  // Grisage interne uniquement quand UrlSelect navigue lui-même ; sinon l'appelant pilote `disabled`.
  const busy = onSelect ? false : pending

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled || busy}>
      <SelectTrigger className={cn('h-9 w-56 text-sm capitalize tabular-nums', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-sm capitalize">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
