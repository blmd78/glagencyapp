'use client'

import { daysIn, type PayPeriod } from '@glagency/core'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { eur2 } from '@/lib/format'
import { payPeriod } from '../actions-pay'
import type { ComptaRow } from '../types'

/**
 * Confirmation de paiement — ADMIN seul (le bouton n'est même pas monté sinon, et `adminGuard`
 * refuse l'action côté serveur). Envoie l'INSTANTANÉ complet : le détail est figé au moment du
 * virement, une correction du CA après coup ne le modifiera plus.
 */
export function ComptaPayDialog({ row, period }: { row: ComptaRow; period: PayPeriod }) {
  const p = row.payslip
  return (
    <ConfirmDialog
      title={`Payer ${row.name} — ${eur2(p.net)} ?`}
      description={
        p.net < 0
          ? 'Le net est NÉGATIF : malus et sanctions dépassent les gains. Enregistrer ce paiement acte un solde dû, il ne déclenche aucun virement.'
          : 'Le détail du calcul sera figé : une correction du CA après coup ne modifiera plus ce paiement.'
      }
      // `ConfirmDialog` est d'abord un dialog de SUPPRESSION : sans ces deux props, le bouton
      // de confirmation d'un paiement s'appellerait « Supprimer » et serait rouge.
      confirmLabel="Marquer payé"
      destructive={false}
      trigger={
        <Button size="sm" className="self-end">
          Marquer payé
        </Button>
      }
      // `ConfirmDialog` affiche lui-même la string renvoyée et RESTE ouvert. Pas de `toast.error`
      // en plus : la même erreur apparaîtrait deux fois.
      onConfirm={async () => {
        const res = await payPeriod({
          chatterId: row.id,
          periodStart: period.start,
          coveredDays: daysIn(period),
          amount: p.net,
          caReference: p.ca,
          // Les segments de taux TELS QU'APPLIQUÉS (0093), et non un taux unique : c'est
          // l'instantané du « à quel taux chaque jour a été payé ». Sans les dates, une période
          // à deux taux serait intracable après coup.
          ratesApplied: p.segments.map((s) => ({
            from: s.from,
            to: s.to,
            rate: s.rate,
            fallback: s.fallback,
          })),
          baseAmount: p.base,
          setterAmount: p.setter,
          bonusAmount: p.bonus,
          malusAmount: p.malus,
          handoffsAmount: p.handoffsAmount,
          primeAmount: p.prime,
          sanctionsAmount: p.sanctions,
          setterPrimeAmount: p.setterPrime,
          note: null,
        })
        if (!res.success) return res.error
        toast.success('Paiement enregistré')
      }}
    />
  )
}
