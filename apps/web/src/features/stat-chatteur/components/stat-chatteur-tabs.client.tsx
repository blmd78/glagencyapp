'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/** `chatteurs` = classement global, vue par défaut (absente de l'URL). */
export type StatChatteurVue = 'chatteurs' | 'modele'

/**
 * Les deux onglets de Stat chatter — Chatteurs (classement global) et Par modèle. L'onglet vit
 * dans l'URL (`?vue=modele`) pour rester partageable et se COMBINER avec la période et `?modele=` :
 * changer de dates ne fait pas revenir à l'onglet global. Patron exact de `ComptaTabs`
 * (`router.replace`, `scroll: false`, sous transition).
 */
export function StatChatteurTabs({
  vue,
  chatteurs,
  parModele,
}: {
  vue: StatChatteurVue
  chatteurs: ReactNode
  parModele: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'chatteurs') params.delete('vue')
    else params.set('vue', next)
    const qs = params.toString()
    // Route construite dynamiquement → cast (convention `date-range-picker.tsx`).
    startTransition(() => router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }))
  }

  return (
    <Tabs value={vue} onValueChange={go} className="flex flex-col gap-6">
      <TabsList className="self-start">
        <TabsTrigger value="chatteurs">Chatteurs</TabsTrigger>
        <TabsTrigger value="modele">Par modèle</TabsTrigger>
      </TabsList>
      <div data-pending={pending ? '' : undefined} className="data-[pending]:opacity-60 data-[pending]:transition-opacity">
        <TabsContent value="chatteurs">{chatteurs}</TabsContent>
        <TabsContent value="modele">{parModele}</TabsContent>
      </div>
    </Tabs>
  )
}
