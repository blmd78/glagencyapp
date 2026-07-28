'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/lib/utils'
import { ENTRY_GRID_COLS, EntryField, EntryStatus } from './compta-entry-grid'
import { COL_HEAD } from './compta-payslip-calc'
import { useRowAutosave } from './use-row-autosave'
import { savePeriodEntry } from '../actions'
import { periodEntryInput, type PeriodEntryInput, type PeriodEntryFormValues } from '../schema'

/** Les 2 champs SAISIS. `chatterId`/`periodStart` identifient la ligne. */
const PERIOD_FIELDS = ['carryover', 'top3Prime'] as const

/**
 * Saisie de la PÉRIODE — le report (`RESTE SEMAINE PASSEE`) et la prime du mois (`PRIME TOP3
 * MOIS`) de la feuille. Une seule ligne, sous les deux lignes-semaines de la fiche.
 *
 * POURQUOI UNE LIGNE SÉPARÉE, ET PAS DEUX CHAMPS DE PLUS SUR CHAQUE SEMAINE. C'est le défaut
 * d'argent corrigé à la tâche 19, à ne pas refaire : `fixe_setter` était un montant par PÉRIODE
 * logé dans une saisie HEBDOMADAIRE, donc affiché deux fois et SOMMÉ — 75 € retapés sur chaque
 * ligne versaient 150 €. Ces deux montants valent pour les 14 jours : ils ont leur propre ligne,
 * leur propre clé (`(chatter_id, period_start)`) et leur propre en-tête.
 *
 * MÊME GRILLE que les semaines (`ENTRY_GRID_COLS`) alors qu'il n'y a que 2 champs : la troisième
 * piste reste vide pour que les colonnes s'alignent d'un bloc à l'autre. Un gabarit à 2 champs
 * aurait décalé les deux blocs voisins de quelques pixels — aucun style nouveau, juste la même
 * grille.
 *
 * ENREGISTREMENT AUTOMATIQUE identique à celui des semaines (`useRowAutosave`) : rien ne part
 * pendant la frappe, tout part quand le focus quitte la ligne ou sur `Entrée`, et le témoin de
 * droite dit où en est l'écriture. Aucun bouton par ligne.
 */
export function ComptaPeriodForm({
  chatterId,
  periodStart,
  periodLabel,
  initial,
}: {
  chatterId: string
  periodStart: string
  /** Libellé de la période (« du 6 au 19 juillet 2026 ») — pour le témoin et les lecteurs
   *  d'écran, jamais recalculé ici. */
  periodLabel: string
  initial: { carryover: number; top3Prime: number }
}) {
  'use no memo'

  const form = useForm<PeriodEntryFormValues, unknown, PeriodEntryInput>({
    resolver: zodResolver(periodEntryInput),
    defaultValues: { chatterId, periodStart, ...initial },
  })
  const {
    register,
    formState: { errors },
  } = form

  const { status, rowProps } = useRowAutosave({
    form,
    fields: PERIOD_FIELDS,
    initial,
    save: savePeriodEntry,
  })

  return (
    <>
      {/* En-tête propre au bloc : les libellés ne sont pas ceux des semaines. `aria-hidden` — les
          `<label>` des champs restent en place (`sm:sr-only`) et suffisent aux lecteurs d'écran. */}
      <div className={cn('hidden sm:grid', ENTRY_GRID_COLS)} aria-hidden>
        <span />
        <span className={COL_HEAD}>Report €</span>
        <span className={COL_HEAD}>Prime du mois €</span>
        <span />
        <span />
      </div>

      <form {...rowProps} className={cn('grid', ENTRY_GRID_COLS)}>
        <span className="col-span-2 text-sm font-medium sm:col-span-1">Période entière</span>

        <EntryField
          id={`carryover-${periodStart}`}
          label="Report €"
          step="0.01"
          error={errors.carryover?.message}
          registration={register('carryover')}
        />
        <EntryField
          id={`top3-${periodStart}`}
          label="Prime du mois €"
          step="0.01"
          error={errors.top3Prime?.message}
          registration={register('top3Prime')}
        />
        {/* Troisième piste laissée vide — cf. l'alignement expliqué en tête de fichier. Masquée
            sous `sm`, où la grille repasse à 2 colonnes : une cellule fantôme y décalerait le
            témoin d'enregistrement d'une rangée. */}
        <span className="hidden sm:block" />

        <EntryStatus status={status} rowLabel={`Période ${periodLabel}`} />

        {errors.root?.serverError && (
          <p role="alert" className="col-span-2 text-sm text-red-600 sm:col-span-full dark:text-red-400">
            {errors.root.serverError.message}
          </p>
        )}
      </form>

      {/* Le report est le SEUL montant signé de la saisie : le dire là où on le tape, sinon
          personne ne devine qu'un trop-perçu s'écrit en négatif (la colonne, elle, l'accepte —
          migration 0090). */}
      <p className="text-xs text-muted-foreground">
        Report : reliquat de la période précédente — négatif pour un trop-perçu à récupérer.
      </p>
    </>
  )
}
