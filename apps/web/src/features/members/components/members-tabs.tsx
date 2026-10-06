'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/** Quatre vues : les comptes, le turnover, le flux d'activité, et les fiches MyPuls (identité +
 *  fiabilité). `liste` est la vue par défaut : elle ne s'écrit pas dans l'URL, pour que
 *  `/chatter/members` reste l'adresse de la page. */
export type MembersVue = 'liste' | 'turnover' | 'activite' | 'fiches'

/**
 * Les quatre vues de la page Membres : la liste des comptes, le turnover de l'agence, le flux
 * d'activité (qui a changé quoi, 0101) et les fiches MyPuls (identité + fiabilité, 0183).
 *
 * ONGLET plutôt que nouvelle route : aucun slug ni droit à créer (la page est déjà réservée aux
 * encadrants), et les statistiques RH vivent là où se gèrent les gens.
 *
 * Patron repris tel quel de `ComptaTabs` / `TodosTabs` : l'onglet actif vit dans l'URL (`?vue=`)
 * pour rester partageable, écrit en `router.replace(..., { scroll: false })` dans un
 * `startTransition` — pas de `push`, donc pas d'entrée d'historique parasite à chaque bascule
 * (guidelines-standard-feature §6).
 *
 * `page.tsx` ne construit QUE la vue demandée : ni le RPC du Turnover ni la lecture d'activité ni
 * celles des fiches MyPuls ne sont payés par qui vient simplement consulter la liste.
 */
export function MembersTabs({
  vue,
  liste,
  turnover,
  activite,
  fiches,
  showActivite = true,
  showFiches = false,
}: {
  vue: MembersVue
  liste: ReactNode
  turnover: ReactNode
  activite: ReactNode
  /** Onglet « Fiches MyPuls » (spec identité 2026-10-01) — ADMINS uniquement, comme Activité :
   *  les tables de 0183 ne sont lisibles que par un admin. */
  fiches: ReactNode
  /** Onglet Activité réservé aux ADMINS (décision Benoit 2026-08-06 — miroir de la RLS 0108
   *  qui ferme member_events aux managers) : masqué pour un manager. */
  showActivite?: boolean
  showFiches?: boolean
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
        {showActivite && <TabsTrigger value="activite">Activité</TabsTrigger>}
        {showFiches && <TabsTrigger value="fiches">Fiches MyPuls</TabsTrigger>}
      </TabsList>
      <div
        data-pending={pending ? '' : undefined}
        className="data-[pending]:opacity-60 data-[pending]:transition-opacity"
      >
        <TabsContent value="liste">{liste}</TabsContent>
        <TabsContent value="turnover">{turnover}</TabsContent>
        {showActivite && <TabsContent value="activite">{activite}</TabsContent>}
        {showFiches && <TabsContent value="fiches">{fiches}</TabsContent>}
      </div>
    </Tabs>
  )
}
