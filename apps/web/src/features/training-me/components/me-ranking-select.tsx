'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { RankScope } from '../types'

const OPTIONS: { value: RankScope; label: string }[] = [
  { value: 'semaine', label: 'Cette semaine' },
  { value: 'semaine-derniere', label: 'Semaine dernière' },
  { value: 'global', label: 'Global' },
]

/**
 * Bascule le classement affiché dans l'onglet Classement — `?vue=classement&classement=<scope>`,
 * défaut `semaine` non écrit dans l'URL (patron de `me-tabs.tsx`). `router.replace` dans un
 * `startTransition` : le serveur relance `getMe` avec la nouvelle RPC (une seule à la fois).
 */
export function MeRankingSelect({ scope }: { scope: RankScope }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    // `ToggleGroup type="single"` renvoie '' au clic sur l'item déjà actif : rien à faire.
    if (!next) return
    const params = new URLSearchParams(searchParams)
    params.set('vue', 'classement')
    if (next === 'semaine') params.delete('classement')
    else params.set('classement', next)
    const qs = params.toString()
    startTransition(() => router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }))
  }

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={scope}
      onValueChange={go}
      className="self-start data-[pending]:opacity-60 data-[pending]:transition-opacity"
      data-pending={pending ? '' : undefined}
    >
      {OPTIONS.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
