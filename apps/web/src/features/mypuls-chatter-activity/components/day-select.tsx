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

/**
 * Jour du détail minute par minute — dans l'URL, pour que la fiche d'une journée précise se
 * partage par lien. `replace` et non `push` : parcourir les jours ne doit pas saturer
 * l'historique du navigateur.
 */
export function DaySelect({
  day,
  dayOptions,
}: {
  day: string
  dayOptions: { value: string; label: string }[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  return (
    <Select
      value={day}
      disabled={pending}
      onValueChange={(v) => {
        const next = new URLSearchParams(params.toString())
        next.set('date', v)
        startTransition(() => router.replace(`?${next.toString()}` as Route, { scroll: false }))
      }}
    >
      <SelectTrigger className="w-[15rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {dayOptions.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
