'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/** Les trois vues de la compta. `periode` est la vue par défaut : elle ne s'écrit pas dans l'URL,
 *  pour que `/chatter/compta` reste l'adresse de la page. */
export type ComptaVue = 'periode' | 'classement' | 'suivi'

/**
 * Les TROIS onglets de la compta — Période, Classement, Suivi — et rien d'autre dans l'app : le
 * lot final remplace un tableur à onglets, pas trois pages de plus dans la sidebar.
 *
 * L'onglet actif vit dans l'URL (`?vue=`) pour rester partageable et se COMBINER avec `?debut=`,
 * qui reste celui de la période : Période et Classement décrivent la même quinzaine, changer
 * d'onglet ne doit pas la perdre. Écrit en `router.replace(..., { scroll: false })` dans un
 * `startTransition` — pas de `push`, donc pas d'entrée d'historique parasite à chaque bascule
 * (docs/guidelines-standard-feature.md §6). C'est le patron exact de `TodosTabs` (2e onglet du
 * Planning), repris tel quel.
 *
 * Radix ne monte dans le DOM que le contenu de l'onglet ACTIF : les deux autres `ReactNode` sont
 * `null` de toute façon, la page ne construisant que celui qui est demandé (cf. `page.tsx`) —
 * l'onglet Suivi ne fait donc payer ses requêtes à personne quand on regarde une période.
 */
export function ComptaTabs({
  vue,
  periode,
  classement,
  suivi,
}: {
  vue: ComptaVue
  periode: ReactNode
  classement: ReactNode
  suivi: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'periode') params.delete('vue')
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
        <TabsTrigger value="periode">Période</TabsTrigger>
        <TabsTrigger value="classement">Classement</TabsTrigger>
        <TabsTrigger value="suivi">Suivi</TabsTrigger>
      </TabsList>
      <div
        data-pending={pending ? '' : undefined}
        className="data-[pending]:opacity-60 data-[pending]:transition-opacity"
      >
        <TabsContent value="periode">{periode}</TabsContent>
        <TabsContent value="classement">{classement}</TabsContent>
        <TabsContent value="suivi">{suivi}</TabsContent>
      </div>
    </Tabs>
  )
}
