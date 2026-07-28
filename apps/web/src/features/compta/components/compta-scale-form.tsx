'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { SetterScaleRow } from '@glagency/core'
import { eur2 } from '@/lib/format'
import { EntryField, EntryStatus } from './compta-entry-grid'
import { useRowAutosave } from './use-row-autosave'
import { saveSetterScale } from '../actions-config'
import {
  setterScaleInput,
  type SetterScaleInput,
  type SetterScaleFormValues,
} from '../schema-config'

/** Le seul champ SAISI d'une tranche. `rank` est la clé de la ligne, il ne bouge jamais. */
const SCALE_FIELDS = ['amount'] as const

/**
 * Le BARÈME du TOP setter (`compta_setter_scale`, 0090) : une tranche par rang, réglable —
 * « je veux pouvoir le régler ». Amorcé sur le barème de juin (200 → 80, Σ 1 796 €).
 *
 * ⚠️ CE QUE CHANGER UNE TRANCHE FAIT. La prime setter n'est stockée nulle part : elle se
 * recalcule à chaque rendu. Modifier une tranche change donc les fiches de TOUTES les périodes
 * encore ouvertes — mais aucune de celles déjà payées, dont le montant est figé dans
 * l'instantané (`setter_prime_amount`, 0091). L'écran le dit sous la grille.
 *
 * LECTURE POUR TOUT L'ENCADREMENT, ÉCRITURE POUR L'ADMIN. Un manager DOIT voir le barème : la
 * prime setter est une composante du net, et ne pas la voir la ferait lire comme 0 € sans la
 * moindre erreur (spec §6, le défaut que 0086 a corrigé sur les sanctions Police). Sans
 * `canConfigure`, la grille reste donc affichée — en lecture seule.
 *
 * UNE LIGNE = UN `<form>` = UNE ÉCRITURE, avec l'enregistrement automatique de la feature
 * (`useRowAutosave`) : aucun bouton par tranche, quinze boutons pour quinze nombres étant
 * exactement la friction que Benoit refuse. L'unité d'écriture est le rang, qui est aussi la clé
 * primaire — envoyer les quinze lignes à chaque frappe réécrirait quatorze valeurs que personne
 * n'a touchées.
 *
 * TROIS COLONNES au-delà de `lg` : quinze lignes empilées feraient défiler l'écran pour une
 * grille qui se lit d'un coup d'œil sur la feuille. L'ordre de tabulation suit les rangs.
 */
export function ComptaScaleForm({
  scale,
  canConfigure,
}: {
  scale: SetterScaleRow[]
  canConfigure: boolean
}) {
  const total = scale.reduce((s, r) => s + r.amount, 0)

  if (!canConfigure) {
    return (
      <>
        <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {scale.map((r) => (
            <div key={r.rank} className="flex justify-between gap-4">
              <span className="text-muted-foreground">Rang {r.rank}</span>
              <span className="tabular-nums">{eur2(r.amount)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {scale.length} tranches, {eur2(total)} au total — réglable par un admin.
        </p>
      </>
    )
  }

  return (
    <>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {scale.map((r) => (
          <ScaleLine key={r.rank} rank={r.rank} amount={r.amount} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {scale.length} tranches, {eur2(total)} au total. Une modification s&apos;applique aux
        périodes non encore payées ; celles déjà réglées gardent le montant figé au virement.
      </p>
    </>
  )
}

/** Une tranche : son rang, son montant, son témoin d'enregistrement. */
function ScaleLine({ rank, amount }: { rank: number; amount: number }) {
  'use no memo'

  const form = useForm<SetterScaleFormValues, unknown, SetterScaleInput>({
    resolver: zodResolver(setterScaleInput),
    defaultValues: { rank, amount },
  })
  const {
    register,
    formState: { errors },
  } = form

  const { status, rowProps } = useRowAutosave({
    form,
    fields: SCALE_FIELDS,
    initial: { amount },
    save: saveSetterScale,
  })

  return (
    <form {...rowProps} className="grid grid-cols-[3.5rem_1fr_5rem] items-center gap-2">
      <span className="text-sm text-muted-foreground">Rang {rank}</span>
      <EntryField
        id={`scale-${rank}`}
        label={`Montant du rang ${rank} en euros`}
        step="0.01"
        error={errors.amount?.message}
        registration={register('amount')}
        // Le rang est déjà écrit à gauche du champ : répéter « Montant du rang 3 » en clair sur
        // mobile ferait deux fois la même phrase. Le `<label>` reste, pour les lecteurs d'écran.
        labelHidden
      />
      <EntryStatus status={status} rowLabel={`Rang ${rank}`} className="justify-self-start" />

      {errors.root?.serverError && (
        <p role="alert" className="col-span-3 text-xs text-red-600 dark:text-red-400">
          {errors.root.serverError.message}
        </p>
      )}
    </form>
  )
}
