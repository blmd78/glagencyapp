'use client'

import type { UseFormRegisterReturn } from 'react-hook-form'
import type { WheelEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { COL_HEAD } from './styles'

/**
 * La GRILLE des saisies hebdomadaires — en-tête de colonnes, cellule de saisie, témoin
 * d'enregistrement. Séparé de `compta-entry-form.tsx` (plafond de 300 lignes, CLAUDE.md) et
 * parce que c'est une frontière nette : ici ce qui se DESSINE, là ce qui se décide et s'écrit.
 */

/**
 * Gabarit de grille PARTAGÉ par l'en-tête de colonnes et par chaque ligne-semaine — les deux
 * doivent s'aligner, donc une seule source.
 *
 * Pistes de largeur FIXE aux deux extrémités (libellé de semaine, témoin d'enregistrement) et
 * non `auto` : l'en-tête et chaque `<form>` sont des grilles CSS DISTINCTES, qui ne partagent
 * pas leurs pistes. Un `auto` y serait mesuré séparément de part et d'autre (rien à mesurer dans
 * l'en-tête, un mot dans les lignes) et décalerait toutes les colonnes.
 *
 * Littéral et non construit : Tailwind ne voit que les classes présentes en clair dans le
 * source. Une seule variante depuis la tâche 16, et TROIS champs depuis la tâche 19 : la
 * colonne « Fixe setter » est partie avec sa saisie — le fixe est un montant par PÉRIODE, il se
 * règle dans Membres (onglet Compta), pas deux fois par période dans une ligne hebdomadaire.
 */
export const ENTRY_GRID_COLS =
  'grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-[9rem_repeat(3,minmax(4.5rem,1fr))_7.5rem] sm:items-center'

/**
 * En-tête de colonnes des saisies : les libellés sont écrits UNE fois pour les 2 semaines
 * de la période, là où chaque formulaire portait les siens (jusqu'à 6 étiquettes pour
 * 3 champs). Masqué sous `sm`, où chaque ligne repasse en pile de deux colonnes avec ses
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
      <span />
    </div>
  )
}

/**
 * Une cellule de saisie. L'étiquette est VISIBLE en pile mobile et réservée aux lecteurs
 * d'écran au-delà (`sm:sr-only`), où `ComptaEntryHeader` prend le relais à l'œil : `sr-only`
 * positionne l'étiquette en absolu, elle ne crée donc aucune piste ni aucun `gap`.
 *
 * Elle monte l'`<Input>` elle-même (elle recevait ses `children` jusqu'au 2026-07-28) pour
 * câbler `aria-invalid` + `aria-describedby` sur le message d'erreur DU CHAMP : sans bouton
 * « Enregistrer », un refus de validation qui ne s'affiche nulle part est une saisie perdue en
 * silence. Le message rouge sous le champ reprend la classe déjà utilisée par l'erreur globale
 * du formulaire — aucune couleur nouvelle.
 *
 * `onWheel` → `blur()` : sur un `<input type="number">` FOCALISÉ, la molette incrémente la
 * valeur (Chrome, Firefox). Avec un bouton, l'incrément accidentel restait sans effet tant
 * qu'on ne cliquait pas ; en enregistrement automatique il deviendrait de l'argent modifié sans
 * geste de saisie. Retirer le focus AVANT l'action par défaut neutralise l'incrément ; le blur
 * qui s'ensuit n'écrit rien puisque la valeur, elle, n'a pas bougé.
 */
export function EntryField({
  id,
  label,
  step,
  error,
  registration,
  labelHidden,
}: {
  id: string
  label: string
  /** `0.01` pour les montants, absent pour les handoffs (entiers). */
  step?: string
  error?: string
  registration: UseFormRegisterReturn
  /** Étiquette réservée aux lecteurs d'écran À TOUTES LES TAILLES. Pour les lignes dont le
   *  libellé est DÉJÀ dans la ligne (le barème dit « Rang 3 » juste à gauche du champ) : l'y
   *  répéter en clair sur mobile ferait deux fois la même phrase. Le `<label>` reste, lui —
   *  c'est lui qui nomme le champ pour un lecteur d'écran. */
  labelHidden?: boolean
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className={labelHidden ? 'sr-only' : 'sm:sr-only'}>
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step={step}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-msg` : undefined}
        onWheel={(e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur()}
        {...registration}
      />
      {error && (
        <p id={`${id}-msg`} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * États d'une ligne, dans l'ordre du geste : rien à signaler → modifié mais pas encore parti →
 * en cours d'envoi → écrit → refusé.
 *
 * `dirty` existe PARCE QUE le bouton a disparu. Avec un bouton, ce qui n'est pas enregistré se
 * voit : le bouton est encore là, non cliqué. Sans lui, une valeur tapée et jamais quittée
 * (onglet fermé le doigt encore dans le champ) ne partirait pas, et rien à l'écran ne le dirait.
 */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const STATUS_LABEL: Record<Exclude<SaveStatus, 'idle'>, string> = {
  dirty: 'Non enregistré',
  saving: 'Enregistrement…',
  saved: 'Enregistré',
  error: 'Échec',
}

/**
 * Aucune couleur nouvelle : `text-muted-foreground` est le gris de toute la feature, le rouge
 * est celui des montants négatifs et des erreurs de formulaire, le vert celui du témoin
 * d'autosave des Codes Snap. Pas d'icône, pas de fond, pas de clignotement — un mot, à la place
 * exacte du bouton.
 */
const STATUS_CLASS: Record<Exclude<SaveStatus, 'idle'>, string> = {
  dirty: 'text-muted-foreground',
  saving: 'text-muted-foreground',
  saved: 'text-green-700 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
}

/**
 * Le témoin d'enregistrement de la ligne — dernière colonne de la grille, là où était le bouton.
 *
 * MONTÉ EN PERMANENCE, vide à l'état `idle` : une région `aria-live` créée en même temps que son
 * contenu n'est pas annoncée par les lecteurs d'écran. Sans ça, l'état d'un enregistrement
 * automatique ne serait annoncé nulle part — l'utilisateur non voyant n'a même plus le clic pour
 * savoir que quelque chose est parti.
 *
 * `aria-atomic` + rappel de la ligne en `sr-only` : un écran en porte plusieurs (2 semaines, ou
 * 15 tranches de barème), qui diraient sinon le même mot sans qu'on sache laquelle vient de
 * changer. `rowLabel` est le libellé COMPLET de la ligne (« Semaine du 6 juil. », « Rang 3 ») et
 * non plus la seule semaine : le témoin sert désormais trois formulaires.
 */
export function EntryStatus({
  status,
  rowLabel,
  // Placement dans la grille de l'appelant. Le défaut est celui des lignes de saisie, qui
  // repassent en pile de 2 colonnes sous `sm`. Le barème, lui, garde 3 colonnes fixes à toutes
  // les tailles : un `col-span-2` y ferait déborder la ligne.
  className = 'col-span-2 justify-self-end sm:col-span-1 sm:justify-self-start',
}: {
  status: SaveStatus
  rowLabel: string
  className?: string
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic
      className={cn('text-xs', className, status !== 'idle' && STATUS_CLASS[status])}
    >
      {status !== 'idle' && (
        <>
          <span className="sr-only">{rowLabel} : </span>
          {STATUS_LABEL[status]}
        </>
      )}
    </span>
  )
}
