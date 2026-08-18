'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { MeVue } from '../types'

/**
 * Trois vues de Ma formation : Progression (défaut, ne s'écrit pas dans l'URL), Historique
 * (`?vue=historique`) et Classement (`?vue=classement`). L'onglet vit dans l'URL pour rester
 * partageable (guidelines §6), `router.replace` dans un `startTransition` — patron de `module-tabs.tsx`.
 */
export function MeTabs({
  vue,
  progression,
  historique,
  classement,
  historyCount,
}: {
  vue: MeVue
  progression: ReactNode
  historique: ReactNode
  classement: ReactNode
  historyCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'progression') params.delete('vue')
    else params.set('vue', next)
    const qs = params.toString()
    startTransition(() => router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }))
  }

  return (
    <Tabs value={vue} onValueChange={go} className="flex flex-col gap-6">
      <TabsList className="self-start">
        <TabsTrigger value="progression">Progression</TabsTrigger>
        <TabsTrigger value="historique">Historique ({historyCount})</TabsTrigger>
        <TabsTrigger value="classement">Classement</TabsTrigger>
      </TabsList>
      <div data-pending={pending ? '' : undefined} className="data-[pending]:opacity-60 data-[pending]:transition-opacity">
        <TabsContent value="progression">{progression}</TabsContent>
        <TabsContent value="historique">{historique}</TabsContent>
        <TabsContent value="classement">{classement}</TabsContent>
      </div>
    </Tabs>
  )
}
