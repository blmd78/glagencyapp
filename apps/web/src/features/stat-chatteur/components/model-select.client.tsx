'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ModelRanking } from '../types'

/**
 * Le choix de la modèle de l'onglet « Par modèle ». Pose `?modele=<creatorId>` (`replace`,
 * `scroll: false` : un filtre, pas une navigation — guidelines §6) ; la période `?from=&to=` reste.
 * Pas `UrlSelect` : il est fait pour les ancres de date (mise en majuscule de chaque mot).
 */
export function ModelSelect({ models, value }: { models: ModelRanking[]; value: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const select = (next: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('modele', next)
    // Query construite dynamiquement → cast (convention `url-select.tsx`).
    startTransition(() => router.replace(`?${params.toString()}` as Route, { scroll: false }))
  }

  return (
    <Select value={value} onValueChange={select} disabled={pending}>
      <SelectTrigger className="h-9 w-64 text-sm" aria-label="Modèle">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {models.map((m) => (
          <SelectItem key={m.creatorId} value={m.creatorId} className="text-sm">
            {m.model}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
