'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { DEFAULT_RATE, frDateNumeric, type RateChange } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { deleteMemberRate } from '../actions-pay'

/**
 * HISTORIQUE DU TAUX d'un membre (`compta_rates`, 0093) — l'onglet Compta du dialog.
 *
 * POURQUOI IL EST À L'ÉCRAN : une augmentation passée est une information de PAIE. Sans elle,
 * l'admin qui rouvre la fiche voit « 11 % » et ne peut pas savoir depuis quand — donc pas
 * vérifier une fiche de juillet payée à deux taux, ni répondre à un chatteur qui la conteste.
 * C'est aussi le seul endroit où une date saisie de travers se voit.
 *
 * FICHIER SÉPARÉ de `member-pay-form.tsx` : les deux réunis dépassaient les 300 lignes
 * (CLAUDE.md). La frontière n'est pas arbitraire — d'un côté ce qui se SAISIT (un formulaire
 * RHF), de l'autre ce qui se RELIT (une liste et une suppression).
 */
export function MemberRateHistory({
  memberId,
  history,
}: {
  memberId: string
  /** Trié par date d'effet croissante (`get-members.ts`). */
  history: RateChange[]
}) {
  // Ligne en cours de suppression — pour désarmer les DEUX boutons du même geste et éviter le
  // double clic sur une écriture de paie.
  const [pending, setPending] = useState<string | null>(null)

  if (history.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucun taux jamais réglé — {DEFAULT_RATE} % s&apos;applique par défaut, y compris aux
        périodes déjà passées.
      </p>
    )
  }

  // Le PLUS RÉCENT en tête : c'est celui qu'on vient poser et celui qu'on relit le plus souvent.
  const rows = [...history].reverse()

  return (
    <div className="flex flex-col gap-1">
      {rows.map((h, i) => (
        <div key={h.effectiveFrom} className="flex items-center justify-between gap-3 text-xs">
          <span className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>
            {h.rate} % à partir du {frDateNumeric(h.effectiveFrom)}
            {i === 0 && ' — en vigueur'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={pending != null}
            aria-label={`Supprimer le taux du ${frDateNumeric(h.effectiveFrom)}`}
            title="Supprimer cette décision de taux"
            onClick={async () => {
              setPending(h.effectiveFrom)
              // `chatterId` : la clé de toutes les tables compta est `profiles.id` depuis 0085,
              // le nom de champ a gardé son ancienne dénomination.
              const res = await deleteMemberRate({ chatterId: memberId, effectiveFrom: h.effectiveFrom })
              setPending(null)
              if (!res.success) {
                toast.error(res.error)
                return
              }
              // Ce que la suppression fait VRAIMENT : les jours couverts par cette ligne
              // repassent au taux d'avant (ou au défaut). Le taire ferait croire à une simple
              // ligne de journal effacée, alors que c'est la paie qui change.
              toast.success('Taux supprimé — ces jours repassent au taux précédent.')
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      {/* Les paiements DÉJÀ enregistrés ne bougent pas : ils portent leur propre instantané
          (`compta_payments.rates_applied`). Le dire ici évite de croire qu'on réécrit du versé. */}
      <p className="text-xs text-muted-foreground">
        Modifier l&apos;historique ne change aucun paiement déjà enregistré.
      </p>
    </div>
  )
}
