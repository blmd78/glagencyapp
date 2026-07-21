'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * Sélecteur de mois PARTAGÉ (Tracker + Rapport du soir) — symétrique de `DaySelect`
 * (`@/components/day-select.tsx`) : MÊME API et mêmes classes, cale une page sur un mois via
 * l'URL (`?month=`). Choisir un mois pousse `?month=` → la page (Server Component) se recharge
 * sur ce mois. Classes/format identiques d'une page à l'autre (uniformité).
 *
 * Navigation : par DÉFAUT MonthSelect la gère lui-même et grise son propre `<Select>` pendant le
 * chargement (cas Rapport). Un appelant qui doit RÉAGIR à la navigation (le Tracker grise son bloc
 * de saisie pendant le chargement) passe `onSelect` : c'est alors LUI qui pousse `?month=` avec sa
 * propre transition — MonthSelect ne double pas la navigation et son `disabled` vient de l'appelant.
 */
export function MonthSelect({
  month,
  months,
  onSelect,
  disabled,
  className,
}: {
  month: string
  months: { month: string; label: string }[]
  /** Fourni = l'appelant gère la navigation ET son `pending` (via `disabled`) ; absent = navigation interne. */
  onSelect?: (month: string) => void
  disabled?: boolean
  className?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  // Navigation interne (défaut) : pose `month` dans les searchParams puis push, sous transition.
  const navigate = (next: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('month', next)
    startTransition(() => router.push(`?${params.toString()}`))
  }
  const handleChange = onSelect ?? navigate
  // Grisage interne uniquement quand MonthSelect navigue lui-même ; sinon l'appelant pilote `disabled`.
  const busy = onSelect ? false : pending

  return (
    <Select value={month} onValueChange={handleChange} disabled={disabled || busy}>
      <SelectTrigger className={cn('h-9 w-56 text-sm capitalize tabular-nums', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {months.map((m) => (
          <SelectItem key={m.month} value={m.month} className="text-sm capitalize">
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
