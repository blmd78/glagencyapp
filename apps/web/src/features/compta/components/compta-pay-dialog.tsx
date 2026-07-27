'use client'

import { daysIn, type Fortnight } from '@glagency/core'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { eur } from '@/lib/format'
import { payFortnight } from '../actions'
import type { ComptaRow } from '../types'

/**
 * Confirmation de paiement — ADMIN seul (le bouton n'est même pas monté sinon, et `adminGuard`
 * refuse l'action côté serveur). Envoie l'INSTANTANÉ complet : le détail est figé au moment du
 * virement, une correction du CA après coup ne le modifiera plus.
 */
export function ComptaPayDialog({ row, fortnight }: { row: ComptaRow; fortnight: Fortnight }) {
  const p = row.payslip
  return (
    <ConfirmDialog
      title={`Payer ${row.name} — ${eur(p.net)} ?`}
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
        const res = await payFortnight({
          chatterId: row.id,
          month: fortnight.month,
          period: fortnight.period,
          coveredDays: daysIn(fortnight),
          amount: p.net,
          caReference: p.ca,
          modeApplied: row.mode,
          rateApplied: row.rate,
          baseAmount: p.base,
          setterAmount: p.setter,
          bonusAmount: p.bonus,
          malusAmount: p.malus,
          handoffsAmount: p.handoffsAmount,
          primeAmount: p.prime,
          sanctionsAmount: p.sanctions,
          note: null,
        })
        if (!res.success) return res.error
        toast.success('Paiement enregistré')
      }}
    />
  )
}
