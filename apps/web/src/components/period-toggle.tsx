'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * Bascule Jour / Mois PARTAGÉE (Tracker + Rapport du soir) — pilote le MODE d'affichage de la page
 * via l'URL (`?vue=jour|mois`). MÊME idiome que le switch Planning/To-do (`todos-tabs.tsx`) : des
 * `Tabs` dont l'onglet actif vit dans l'URL, écrits en `router.replace(..., { scroll: false })`
 * (pas de `push` : changer de vue n'a pas à empiler une entrée d'historique — guidelines §6).
 * Sur bascule on SUPPRIME `day`/`month` → la page (Server Component) applique le défaut du nouveau
 * mode (aujourd'hui / mois courant) ; `jour` = défaut → on retire `vue` de l'URL (URL propre).
 * Pas de `TabsContent` ici : le contenu est rendu côté serveur selon `?vue=`, ces onglets ne sont
 * que le contrôle de navigation.
 */
export function PeriodToggle({ vue, className }: { vue: 'jour' | 'mois'; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (target: string) => {
    if (target === vue) return
    const params = new URLSearchParams(searchParams)
    if (target === 'jour') params.delete('vue')
    else params.set('vue', target)
    params.delete('day')
    params.delete('month')
    const qs = params.toString()
    // Route construite dynamiquement → cast (pas un href statique connu de typedRoutes, convention
    // `todos-tabs.tsx`).
    startTransition(() =>
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }),
    )
  }

  return (
    <Tabs value={vue} onValueChange={go} className={className}>
      <TabsList
        data-pending={pending ? '' : undefined}
        className="data-[pending]:opacity-60 data-[pending]:transition-opacity"
      >
        <TabsTrigger value="jour">Jour</TabsTrigger>
        <TabsTrigger value="mois">Mois</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
