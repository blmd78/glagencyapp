'use client'

import { addDays, frDateNumeric, type PayPeriod } from '@glagency/core'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { eur2 } from '@/lib/format'
import { payAllForPeriod } from '../actions-pay'
import { planBatchPay, type BatchPayPlan, type ComptaRow } from '../types'

/**
 * PAIEMENT GROUPÉ de la période — le bouton et sa confirmation. En haut de page, à côté du
 * sélecteur de période : régler une centaine de membres depuis leurs fiches dépliées, une par
 * une, n'est pas tenable.
 *
 * ADMIN SEUL : `ComptaView` ne le monte que sous `canPay`, et `adminGuard` + la RLS
 * `compta_payments_admin_write` (0085) sont le verrou réel — masquer un bouton n'est qu'optimiste.
 *
 * RIEN NE DISPARAÎT EN SILENCE. Quand il n'y a pas de bouton, il y a une phrase qui dit
 * pourquoi : période en cours, ou plus personne à payer. Même correction que celle déjà faite
 * sur le bouton unitaire, où l'absence de bouton sur la période courante était un cul-de-sac.
 */

/** Les écartés, en clair — « 3 déjà réglés, 8 non reliés à MyPuls ». Null si le lot prend tout
 *  le monde : une mention vide vaut mieux que « Mis de côté : ». */
function setAsideLabel(plan: BatchPayPlan): string | null {
  const parts: string[] = []
  const s = (n: number) => (n > 1 ? 's' : '')
  if (plan.covered > 0) parts.push(`${plan.covered} déjà réglé${s(plan.covered)}`)
  if (plan.unlinked > 0) parts.push(`${plan.unlinked} non relié${s(plan.unlinked)} à MyPuls`)
  if (plan.zero > 0) parts.push(`${plan.zero} à net nul`)
  if (plan.negative > 0) parts.push(`${plan.negative} à net négatif`)
  return parts.length > 0 ? parts.join(', ') : null
}

export function ComptaPayAllDialog({
  rows,
  period,
  periodElapsed,
}: {
  rows: ComptaRow[]
  period: PayPeriod
  /** Période TERMINÉE. DISTINCT du droit : `payAllForPeriod` refuse de figer des jours non
   *  révolus, ne pas monter un bouton qui échouerait à coup sûr. */
  periodElapsed: boolean
}) {
  // LA MÊME fonction que celle qu'exécute `payAllForPeriod` côté serveur (`types.ts`) : ce que
  // ce bouton annonce et ce que l'action paie ne peuvent pas diverger.
  const plan = planBatchPay(rows)
  const aside = setAsideLabel(plan)
  const count = plan.payable.length
  const s = count > 1 ? 's' : ''

  if (!periodElapsed) {
    return (
      <p className="text-xs text-muted-foreground">
        Période en cours — le paiement groupé s&apos;ouvre à partir du{' '}
        {frDateNumeric(addDays(period.end, 1))}.
      </p>
    )
  }

  if (count === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucun chatter à payer sur cette période{aside ? ` — ${aside}` : ''}.
      </p>
    )
  }

  return (
    <ConfirmDialog
      title={`Payer ${count} chatter${s} — ${eur2(plan.total)} ?`}
      description={
        // `AlertDialogDescription` rend un `<p>` : des `<span className="block">`, jamais des
        // `<div>`, qui donneraient du HTML invalide.
        <>
          <span className="block">
            {count} fiche{s} de la période {period.label} — le détail de chacune sera FIGÉ : une
            correction du CA après coup ne modifiera plus ces paiements.
          </span>
          {aside && (
            <span className="mt-2 block">
              Mis de côté : {aside}.
              {(plan.negative > 0 || plan.zero > 0) &&
                ' Un net négatif ou nul reste payable à l’unité depuis sa fiche.'}
            </span>
          )}
        </>
      }
      // `ConfirmDialog` est d'abord un dialog de SUPPRESSION : sans ces deux props, le bouton
      // de confirmation d'un paiement s'appellerait « Supprimer » et serait rouge.
      confirmLabel={`Payer les ${count}`}
      destructive={false}
      trigger={
        <Button size="sm">
          Payer la période — {eur2(plan.total)}
        </Button>
      }
      // `ConfirmDialog` affiche lui-même la string renvoyée et RESTE ouvert. Un échec PARTIEL en
      // renvoie une : le dialog reste ouvert avec le détail sous les yeux pendant que la table,
      // déjà revalidée par l'action, se met à jour derrière. Fermer sur un toast tronqué ferait
      // disparaître les noms des fiches qui n'ont pas été réglées.
      onConfirm={async () => {
        const res = await payAllForPeriod({
          periodStart: period.start,
          memberIds: plan.payable.map((r) => r.id),
          total: plan.total,
        })
        if (!res.success) return res.error

        const { paid, total, failed } = res.data
        if (failed.length === 0) {
          toast.success(`${paid} paiement${paid > 1 ? 's' : ''} enregistré${paid > 1 ? 's' : ''} — ${eur2(total)}`)
          return
        }
        // Cap à 5 noms : au-delà, la liste déborde du dialog et l'essentiel (combien sont
        // passés) se perd. Le reste est compté, jamais tu.
        const head = failed.slice(0, 5).map((f) => `${f.name} — ${f.reason}`).join(' · ')
        const rest = failed.length - Math.min(failed.length, 5)
        return (
          `${paid} paiement${paid > 1 ? 's' : ''} enregistré${paid > 1 ? 's' : ''} (${eur2(total)}). ` +
          `${failed.length} en échec : ${head}${rest > 0 ? ` · et ${rest} autre${rest > 1 ? 's' : ''}` : ''}`
        )
      }}
    />
  )
}
