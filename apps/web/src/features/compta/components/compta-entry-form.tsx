'use client'

import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionButton } from '@/components/action-button'
import { cn } from '@/lib/utils'
import { COL_HEAD } from './compta-payslip-calc'
import { saveWeekEntry } from '../actions'
import { weekEntryInput, type WeekEntryInput, type WeekEntryFormValues } from '../schema'

/**
 * Gabarit de grille PARTAGÉ par l'en-tête de colonnes et par chaque ligne-semaine — les deux
 * doivent s'aligner, donc une seule source.
 *
 * Pistes de largeur FIXE aux deux extrémités (libellé de semaine, bouton) et non `auto` :
 * l'en-tête et chaque `<form>` sont des grilles CSS DISTINCTES, qui ne partagent pas leurs
 * pistes. Un `auto` y serait mesuré séparément de part et d'autre (rien à mesurer dans
 * l'en-tête, un bouton dans les lignes) et décalerait toutes les colonnes.
 *
 * Littéral et non construit : Tailwind ne voit que les classes présentes en clair dans le
 * source. Une seule variante depuis la tâche 16 — les 4 champs sont montés pour tout le monde,
 * `compta_settings.is_setter` ne commande plus la colonne « Fixe setter » (elle n'existe plus).
 */
const ENTRY_GRID_COLS =
  'grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-[9rem_repeat(4,minmax(4.5rem,1fr))_7.5rem] sm:items-center'

/**
 * En-tête de colonnes des saisies : les libellés sont écrits UNE fois pour les 2 semaines
 * de la période, là où chaque formulaire portait les siens (jusqu'à 8 étiquettes pour
 * 4 champs). Masqué sous `sm`, où chaque ligne repasse en pile de deux colonnes avec ses
 * propres étiquettes visibles.
 *
 * `aria-hidden` : les `<label>` des champs restent en place (`sm:sr-only`) et suffisent aux
 * lecteurs d'écran — cet en-tête est le relais VISUEL, l'annoncer une seconde fois doublerait
 * chaque champ.
 */
export function ComptaEntryHeader() {
  return (
    <div className={cn('hidden sm:grid', ENTRY_GRID_COLS)} aria-hidden>
      <span />
      <span className={COL_HEAD}>Bonus €</span>
      <span className={COL_HEAD}>Malus €</span>
      <span className={COL_HEAD}>Handoffs</span>
      <span className={COL_HEAD}>Fixe setter €</span>
      <span />
    </div>
  )
}

/**
 * Une cellule de saisie. L'étiquette est VISIBLE en pile mobile et réservée aux lecteurs
 * d'écran au-delà (`sm:sr-only`), où `ComptaEntryHeader` prend le relais à l'œil : `sr-only`
 * positionne l'étiquette en absolu, elle ne crée donc aucune piste ni aucun `gap`.
 */
function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="sm:sr-only">
        {label}
      </Label>
      {children}
    </div>
  )
}

/**
 * Saisie hebdomadaire (bonus, malus, handoffs, fixe setter). Une semaine appartient
 * entièrement à la période de son lundi — elle n'est jamais découpée.
 *
 * « Fixe setter » y est un AJUSTEMENT de la période : renseigné, il REMPLACE le fixe des
 * réglages pour cette paie (le demi-fixe à 37,50 € de la feuille), il ne s'y ajoute jamais —
 * ce serait un double versement. Laissé à 0, c'est le réglage qui s'applique (`computePayslip`).
 *
 * UNE LIGNE par semaine depuis le 2026-07-27 (« simplifie l'affichage ») : c'était un encadré
 * titré par semaine, soit 2 cartes empilées répétant les mêmes quatre champs, et c'est ce
 * qui rendait le panneau déplié écrasant pour un admin. Le cadre a sauté avec le titre : la
 * grille aligne les colonnes, elle n'a plus besoin d'être délimitée.
 */
export function ComptaEntryForm({
  chatterId,
  weekStart,
  weekLabel,
  initial,
  onSaved,
}: {
  chatterId: string
  weekStart: string
  weekLabel: string
  initial: { bonus: number; malus: number; handoffs: number; fixeSetter: number; note: string | null }
  onSaved?: () => void
}) {
  'use no memo'

  // Triple générique (Input, Context, Output) : `weekEntryInput` a des champs `z.coerce.number()`
  // dont l'input est `unknown` → input ≠ output. Même patron que `report-form.tsx`
  // (police-reports) pour la même raison.
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WeekEntryFormValues, unknown, WeekEntryInput>({
    resolver: zodResolver(weekEntryInput),
    defaultValues: { chatterId, weekStart, ...initial },
  })

  const submit = handleSubmit(async (values) => {
    const res = await saveWeekEntry(values)
    if (!res.success) {
      setError('root.serverError', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Saisie enregistrée')
    onSaved?.()
  })

  return (
    <form onSubmit={submit} className={cn('grid', ENTRY_GRID_COLS)}>
      <span className="col-span-2 text-sm font-medium sm:col-span-1">Semaine du {weekLabel}</span>

      <Field id={`bonus-${weekStart}`} label="Bonus €">
        <Input id={`bonus-${weekStart}`} type="number" step="0.01" {...register('bonus')} />
      </Field>
      <Field id={`malus-${weekStart}`} label="Malus €">
        <Input id={`malus-${weekStart}`} type="number" step="0.01" {...register('malus')} />
      </Field>
      <Field id={`handoffs-${weekStart}`} label="Handoffs">
        <Input id={`handoffs-${weekStart}`} type="number" {...register('handoffs')} />
      </Field>
      <Field id={`fixe-${weekStart}`} label="Fixe setter €">
        <Input id={`fixe-${weekStart}`} type="number" step="0.01" {...register('fixeSetter')} />
      </Field>

      <ActionButton
        type="submit"
        size="sm"
        pending={isSubmitting}
        className="col-span-2 justify-self-end sm:col-span-1 sm:w-full"
      >
        Enregistrer
      </ActionButton>

      {errors.root?.serverError && (
        <p role="alert" className="col-span-2 text-sm text-red-600 sm:col-span-full dark:text-red-400">
          {errors.root.serverError.message}
        </p>
      )}
    </form>
  )
}
