'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/** Trois vues : les comptes, les statistiques de turnover, et le flux d'activité.
 *  `liste` est la vue par défaut : elle ne s'écrit pas dans l'URL, pour que `/chatter/members`
 *  reste l'adresse de la page. */
export type MembersVue = 'liste' | 'turnover' | 'activite'

/**
 * Les trois vues de la page Membres : la liste des comptes, le turnover de l'agence, et le flux
 * d'activité (qui a changé quoi, 0104).
 *
 * ONGLET plutôt que nouvelle route : aucun slug ni droit à créer (la page est déjà réservée aux
 * encadrants), et les statistiques RH vivent là où se gèrent les gens.
 *
 * Patron repris tel quel de `ComptaTabs` / `TodosTabs` : l'onglet actif vit dans l'URL (`?vue=`)
 * pour rester partageable, écrit en `router.replace(..., { scroll: false })` dans un
 * `startTransition` — pas de `push`, donc pas d'entrée d'historique parasite à chaque bascule
 * (guidelines-standard-feature §6).
 *
 * `page.tsx` ne construit QUE la vue demandée : ni le RPC du Turnover ni la lecture d'activité ne
 * sont payés par qui vient simplement consulter la liste.
 */
export function MembersTabs({
  vue,
  liste,
  turnover,
  activite,
}: {
  vue: MembersVue
  liste: ReactNode
  turnover: ReactNode
  activite: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'liste') params.delete('vue')
    else params.set('vue', next)
    const qs = params.toString()
    // Route construite dynamiquement → pas un href statique connu de typedRoutes.
    startTransition(() =>
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }),
    )
  }

  return (
    <Tabs value={vue} onValueChange={go} className="flex flex-col gap-6">
      <TabsList className="self-start">
        <TabsTrigger value="liste">Comptes</TabsTrigger>
        <TabsTrigger value="turnover">Turnover</TabsTrigger>
        <TabsTrigger value="activite">Activité</TabsTrigger>
      </TabsList>
      <div
        data-pending={pending ? '' : undefined}
        className="data-[pending]:opacity-60 data-[pending]:transition-opacity"
      >
        <TabsContent value="liste">{liste}</TabsContent>
        <TabsContent value="turnover">{turnover}</TabsContent>
        <TabsContent value="activite">{activite}</TabsContent>
      </div>
    </Tabs>
  )
}
