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
 * Sélecteur de jour PARTAGÉ (Tracker + Rapport du soir) — LE composant unique pour caler une
 * page sur un jour via l'URL (`?day=`). Choisir un jour pousse `?day=` → la page (Server
 * Component) se recharge sur ce jour. Classes/format identiques d'une page à l'autre (uniformité).
 *
 * Navigation : par DÉFAUT DaySelect la gère lui-même et grise son propre `<Select>` pendant le
 * chargement (cas Rapport). Un appelant qui doit RÉAGIR à la navigation (le Tracker grise son bloc
 * de saisie pendant le chargement) passe `onSelect` : c'est alors LUI qui pousse `?day=` avec sa
 * propre transition — DaySelect ne double pas la navigation et son `disabled` vient de l'appelant.
 */
export function DaySelect({
  day,
  days,
  onSelect,
  disabled,
  className,
}: {
  day: string
  days: { day: string; label: string }[]
  /** Fourni = l'appelant gère la navigation ET son `pending` (via `disabled`) ; absent = navigation interne. */
  onSelect?: (day: string) => void
  disabled?: boolean
  className?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  // Navigation interne (défaut) : pose `day` dans les searchParams puis push, sous transition.
  const navigate = (next: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('day', next)
    startTransition(() => router.push(`?${params.toString()}`))
  }
  const handleChange = onSelect ?? navigate
  // Grisage interne uniquement quand DaySelect navigue lui-même ; sinon l'appelant pilote `disabled`.
  const busy = onSelect ? false : pending

  return (
    <Select value={day} onValueChange={handleChange} disabled={disabled || busy}>
      <SelectTrigger className={cn('h-9 w-56 text-sm capitalize tabular-nums', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {days.map((d) => (
          <SelectItem key={d.day} value={d.day} className="text-sm capitalize">
            {d.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
