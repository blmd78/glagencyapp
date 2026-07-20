'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * Bascule Planning journalier ↔ To-do. L'onglet actif vit dans l'URL (`?vue=`) pour rester
 * partageable et se combiner avec `?membre=` — écrit en `router.replace(..., { scroll: false })`
 * dans un `startTransition` (docs/guidelines-standard-feature.md §6 : pas de `push`, pas
 * d'entrée d'historique parasite à chaque changement d'onglet).
 */
export function TodosTabs({
  vue,
  planning,
  todo,
}: {
  vue: 'planning' | 'todo'
  planning: ReactNode
  todo: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'planning') params.delete('vue')
    else params.set('vue', next)
    const qs = params.toString()
    // Route construite dynamiquement → pas un href statique connu de typedRoutes (convention
    // `date-range-picker.tsx`).
    startTransition(() =>
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }),
    )
  }

  return (
    <Tabs value={vue} onValueChange={go} className="flex flex-col gap-6">
      <TabsList className="self-start">
        <TabsTrigger value="planning">Planning journalier</TabsTrigger>
        <TabsTrigger value="todo">To-do</TabsTrigger>
      </TabsList>
      <div
        data-pending={pending ? '' : undefined}
        className="data-[pending]:opacity-60 data-[pending]:transition-opacity"
      >
        <TabsContent value="planning">{planning}</TabsContent>
        <TabsContent value="todo">{todo}</TabsContent>
      </div>
    </Tabs>
  )
}
