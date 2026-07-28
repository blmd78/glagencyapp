'use client'

// Sélecteur de période de la Compta — UN SEUL contrat pour les onglets Période (`ComptaView`)
// et Classement (`ComptaRankingView`) : pousser `?debut=` (le lundi de départ — une période n'a
// plus d'autre identifiant depuis 0088) via `router.replace` sans `scroll`, la page Server
// Component se recharge sur la période choisie et `ComptaTabs` préserve le paramètre en
// basculant. Extrait pour ne pas dupliquer la navigation ni le markup entre les deux vues.
//
// `usePeriodSelect` reste séparé du composant : les vues ont besoin de `pending` pour leur
// propre opacité de transition (tout l'onglet se grise, pas seulement le sélecteur).

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import type { PayPeriod } from '@glagency/core'
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'

/** Navigation `?debut=` + état de transition — consommé par la vue ET le sélecteur. */
export function usePeriodSelect() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const select = (debut: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('debut', debut)
    startTransition(() => router.replace(`/chatter/compta?${params.toString()}` as Route, { scroll: false }))
  }

  return { pending, select }
}

/**
 * Le sélecteur lui-même. `w-72` et non `w-56` : le libellé dit « du 22 juin au 5 juillet 2026 »
 * quand la période chevauche deux mois, ce que 14 rem tronquerait.
 */
export function ComptaPeriodPicker({
  period,
  choices,
  pending,
  onSelect,
  className,
}: {
  period: PayPeriod
  choices: PayPeriod[]
  pending: boolean
  onSelect: (debut: string) => void
  /** Positionnement dans la vue hôte (`ml-auto`, `self-end`…) — jamais de style nouveau. */
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-sm text-muted-foreground">Période :</span>
      <Combobox
        value={period.start}
        onChange={onSelect}
        disabled={pending}
        className="w-72"
        searchPlaceholder="Rechercher une période…"
        options={choices.map((p) => ({ value: p.start, label: p.label }))}
      />
    </div>
  )
}
