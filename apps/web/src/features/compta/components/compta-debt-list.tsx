'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { frDateNumeric } from '@glagency/core'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { eur2 } from '@/lib/format'
import { COL_HEAD } from './compta-payslip-calc'
import { ComptaDebtForm } from './compta-debt-form'
import { setDebtSettled, deleteDebt } from '../actions-config'
import type { SuiviDebt } from '../types'

/**
 * Les SOLDES DES PARTANTS (`compta_debts`) — ADMIN seul (spec §6). Ce que quelqu'un doit encore,
 * ou devait : l'onglet « COMPTA CHATTEURS OFF ⛔ » de la feuille.
 *
 * LE NOM EST DU TEXTE LIBRE, et c'est le choix de 0084 : « une dette peut viser quelqu'un qui
 * n'est pas (ou plus) chatteur ». Une clé étrangère vers `profiles` aurait fait disparaître la
 * dette avec le compte — exactement au moment où elle devient utile.
 *
 * UN SOLDÉ RESTE À L'ÉCRAN, barré. C'est une trace, pas un déchet : savoir qu'un compte a été
 * réglé le 12/07 est l'information même que cette liste porte. La corbeille est réservée à la
 * ligne saisie par erreur, derrière une confirmation.
 */
export function ComptaDebtList({ debts }: { debts: SuiviDebt[] }) {
  const open = debts.filter((d) => !d.settled)
  const due = open.reduce((s, d) => s + d.amount, 0)

  return (
    <div className="flex flex-col gap-4">
      {debts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun solde enregistré.</p>
      ) : (
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 gap-y-1.5 text-sm">
          <span className={COL_HEAD}>Nom</span>
          <span className={COL_HEAD}>Modèle</span>
          <span className={`${COL_HEAD} text-right`}>Montant</span>
          <span className={COL_HEAD}>État</span>
          <span />

          {debts.map((d) => (
            <DebtLine key={d.id} debt={d} />
          ))}
        </div>
      )}

      {open.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {open.length} solde{open.length > 1 ? 's' : ''} ouvert{open.length > 1 ? 's' : ''} —{' '}
          {eur2(due)} au total.
        </p>
      )}

      <ComptaDebtForm />
    </div>
  )
}

/**
 * Une ligne. Le bouton « Soldé » envoie la VALEUR VOULUE et non « inverse » : un double-clic sur
 * un basculement côté serveur laisserait la dette dans son état de départ sans que rien ne le
 * dise (cf. `debtSettleInput`).
 *
 * `useTransition` et non un `useState` de chargement : l'action fait un `revalidatePath`, donc
 * `pending` couvre AUSSI le re-rendu serveur — sans lui, le bouton se réactiverait avant que la
 * ligne n'ait changé à l'écran, et on croirait le clic perdu.
 */
function DebtLine({ debt }: { debt: SuiviDebt }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = () => {
    setError(null)
    startTransition(async () => {
      const res = await setDebtSettled({ id: debt.id, settled: !debt.settled })
      if (!res.success) {
        setError(res.error)
        toast.error(res.error)
      }
    })
  }

  return (
    <>
      <span className={debt.settled ? 'min-w-0 truncate text-muted-foreground line-through' : 'min-w-0 truncate font-medium'}>
        {debt.name}
      </span>
      <span className="text-muted-foreground">{debt.model ?? '—'}</span>
      <span className={debt.settled ? 'text-right tabular-nums text-muted-foreground' : 'text-right tabular-nums'}>
        {eur2(debt.amount)}
      </span>
      <span className="text-xs text-muted-foreground">
        {debt.settled
          ? `soldé${debt.settledAt ? ` le ${frDateNumeric(debt.settledAt)}` : ''}`
          : 'ouvert'}
      </span>
      <span className="flex items-center justify-end gap-1">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={toggle}>
          {debt.settled ? 'Rouvrir' : 'Soldé'}
        </Button>
        <ConfirmDialog
          title={`Supprimer le solde de ${debt.name} ?`}
          description="La ligne disparaît définitivement. Pour garder la trace d’un règlement, marque-la « soldé » plutôt que de la supprimer."
          trigger={
            <Button type="button" size="icon" variant="ghost" aria-label={`Supprimer le solde de ${debt.name}`}>
              <Trash2 className="size-4" />
            </Button>
          }
          onConfirm={async () => {
            const res = await deleteDebt({ id: debt.id })
            if (!res.success) return res.error
            toast.success('Solde supprimé')
          }}
        />
      </span>
      {error && (
        <p role="alert" className="col-span-5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  )
}
