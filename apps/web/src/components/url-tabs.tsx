'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/** Un onglet : sa valeur d'URL, son libellé, et ce qu'il affiche (rendu par le Server Component parent). */
export type UrlTab = { value: string; label: ReactNode; content: ReactNode }

/**
 * Onglets PILOTÉS PAR L'URL (`?vue=…`) — LE composant unique de la face Formation (Modules, Ma
 * formation, Roue), qui en avaient chacune une copie au mot près. L'onglet vit dans l'URL pour
 * rester partageable (guidelines §6) ; la valeur par DÉFAUT ne s'écrit pas (URL propre), et
 * `router.replace` + `scroll: false` évite l'entrée d'historique parasite et la remontée de page.
 *
 * `value` reste une PROP : c'est la page (Server Component) qui valide `?vue=` et la normalise —
 * la relire ici laisserait un `?vue=nimporte-quoi` vider le contenu.
 *
 * Feuille cliente : les contenus arrivent déjà rendus dans `items[].content`, le parent n'a donc
 * pas besoin de passer `'use client'`.
 */
export function UrlTabs({
  value,
  items,
  defaultValue,
  param = 'vue',
}: {
  /** Onglet actif, validé par la page. */
  value: string
  items: UrlTab[]
  /** Valeur qui ne s'écrit PAS dans l'URL (l'onglet d'accueil). */
  defaultValue: string
  /** Paramètre d'URL piloté — `vue` partout aujourd'hui. */
  param?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === defaultValue) params.delete(param)
    else params.set(param, next)
    const qs = params.toString()
    startTransition(() => router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }))
  }

  return (
    <Tabs value={value} onValueChange={go} className="flex flex-col gap-6">
      <TabsList className="self-start">
        {items.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div data-pending={pending ? '' : undefined} className="data-[pending]:opacity-60 data-[pending]:transition-opacity">
        {items.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {t.content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}
