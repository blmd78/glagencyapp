'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { WheelVue } from '../types'

/**
 * Deux vues de la Roue : la roue (défaut, ne s'écrit pas dans l'URL) et l'historique de tous les
 * tirages (`?vue=historique`, encadrants seulement — le parent ne rend ces onglets que dans ce
 * cas). L'onglet vit dans l'URL pour rester partageable (guidelines §6) — patron de `me-tabs.tsx`.
 */
export function WheelTabs({ vue, roue, historique }: { vue: WheelVue; roue: ReactNode; historique: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'roue') params.delete('vue')
    else params.set('vue', next)
    const qs = params.toString()
    startTransition(() => router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }))
  }

  return (
    <Tabs value={vue} onValueChange={go} className="flex flex-col gap-6">
      <TabsList className="self-start">
        <TabsTrigger value="roue">Roue</TabsTrigger>
        <TabsTrigger value="historique">Historique</TabsTrigger>
      </TabsList>
      <div data-pending={pending ? '' : undefined} className="data-[pending]:opacity-60 data-[pending]:transition-opacity">
        <TabsContent value="roue">{roue}</TabsContent>
        <TabsContent value="historique">{historique}</TabsContent>
      </div>
    </Tabs>
  )
}
