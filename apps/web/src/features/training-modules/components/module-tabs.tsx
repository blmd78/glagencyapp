'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ModuleVue } from '../types'

/**
 * Deux vues d'un module : Cours (défaut, ne s'écrit pas dans l'URL) et Cas (`?vue=cas`). L'onglet
 * vit dans l'URL pour rester partageable (guidelines §6), `router.replace` dans un
 * `startTransition` — patron repris de `members-tabs.tsx` / `ComptaTabs`.
 */
export function ModuleTabs({ vue, cours, cas, casCount }: { vue: ModuleVue; cours: ReactNode; cas: ReactNode; casCount: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'cours') params.delete('vue')
    else params.set('vue', next)
    const qs = params.toString()
    startTransition(() => router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }))
  }

  return (
    <Tabs value={vue} onValueChange={go} className="flex flex-col gap-6">
      <TabsList className="self-start">
        <TabsTrigger value="cours">Cours</TabsTrigger>
        <TabsTrigger value="cas">Cas ({casCount})</TabsTrigger>
      </TabsList>
      <div data-pending={pending ? '' : undefined} className="data-[pending]:opacity-60 data-[pending]:transition-opacity">
        <TabsContent value="cours">{cours}</TabsContent>
        <TabsContent value="cas">{cas}</TabsContent>
      </div>
    </Tabs>
  )
}
