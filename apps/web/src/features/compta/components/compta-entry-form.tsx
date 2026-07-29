'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/lib/utils'
import { ENTRY_GRID_COLS, EntryField, EntryStatus } from './compta-entry-grid'
import { useRowAutosave } from './use-row-autosave'
import { saveWeekEntry } from '../actions'
import { weekEntryInput, type WeekEntryInput, type WeekEntryFormValues } from '../schema'

/** Les 3 champs SAISIS. `chatterId`/`weekStart` identifient la ligne, `note` n'a pas d'input. */
const AMOUNT_FIELDS = ['bonus', 'malus', 'handoffs'] as const

/**
 * Saisie hebdomadaire (bonus, malus, handoffs). Une semaine appartient entièrement à la période
 * de son lundi — elle n'est jamais découpée.
 *
 * ── POURQUOI PLUS DE « FIXE SETTER » ICI (2026-07-28, tâche 19) ─────────────────────────────
 * Le champ existait, en quatrième position, et REMPLAÇAIT pour la période le fixe des réglages.
 * Il était faux par construction : le fixe est un montant PAR PÉRIODE (il n'est rempli qu'une
 * fois par paie sur la feuille du propriétaire), alors que cette ligne est HEBDOMADAIRE — le
 * champ s'affichait donc DEUX FOIS par période, et `compta-rows.ts` SOMMAIT les deux. Saisir
 * 75 € sur les deux lignes, ce que deux champs identiques invitent à faire, versait 150 €.
 * Le fixe se règle maintenant à un seul endroit : l'onglet Compta du dialog de Membres
 * (`compta_settings`).
 *
 * UNE LIGNE par semaine depuis le 2026-07-27 (« simplifie l'affichage ») : c'était un encadré
 * titré par semaine, soit 2 cartes empilées répétant les mêmes champs.
 *
 * ── ENREGISTREMENT AUTOMATIQUE ─────────────────────────────────────────────────────────────
 * Le bouton « Enregistrer » a disparu le 2026-07-28 : 2 semaines × ~100 chatteurs faisaient
 * 200 boutons pour une saisie qui n'a qu'un geste (« met pas le bouton enregistré en face de
 * chaque ligne ça fait trop de friction »). La mécanique — quand ça part, ce qui est comparé,
 * comment les envois sont sérialisés — vit dans `useRowAutosave`, partagée depuis le lot final
 * avec la saisie de la période et le barème setter. Elle n'a pas changé : elle a été extraite.
 *
 * Deux semaines = deux `week_start` = deux lignes distinctes : aucun conflit possible entre
 * elles, rien à sérialiser à ce niveau (la file est PAR ligne).
 */
export function ComptaEntryForm({
  chatterId,
  weekStart,
  weekLabel,
  initial,
}: {
  chatterId: string
  weekStart: string
  weekLabel: string
  initial: { bonus: number; malus: number; handoffs: number; note: string | null }
}) {
  'use no memo'

  // Triple générique (Input, Context, Output) : `weekEntryInput` a des champs `z.coerce.number()`
  // dont l'input est `unknown` → input ≠ output. Même patron que `report-form.tsx`
  // (police-reports) pour la même raison.
  const form = useForm<WeekEntryFormValues, unknown, WeekEntryInput>({
    resolver: zodResolver(weekEntryInput),
    defaultValues: { chatterId, weekStart, ...initial },
  })
  const {
    register,
    formState: { errors },
  } = form

  const { status, rowProps } = useRowAutosave({
    form,
    fields: AMOUNT_FIELDS,
    initial: { bonus: initial.bonus, malus: initial.malus, handoffs: initial.handoffs },
    save: saveWeekEntry,
  })

  const err = (f: (typeof AMOUNT_FIELDS)[number]) => errors[f]?.message

  return (
    <form {...rowProps} className={cn('grid', ENTRY_GRID_COLS)}>
      <span className="col-span-2 text-sm font-medium sm:col-span-1">Semaine du {weekLabel}</span>

      {/* Ids suffixés par chatterId : plusieurs fiches peuvent être dépliées en même temps et
          toutes partagent les 2 mêmes lundis — sans le suffixe, deux fiches ouvertes dupliquent
          les ids et le label focalise le champ de la MAUVAISE fiche (même règle que le
          `idSuffix` de report-panel). */}
      <EntryField
        id={`bonus-${chatterId}-${weekStart}`}
        label="Bonus €"
        step="0.01"
        error={err('bonus')}
        registration={register('bonus')}
      />
      <EntryField
        id={`malus-${chatterId}-${weekStart}`}
        label="Malus €"
        step="0.01"
        error={err('malus')}
        registration={register('malus')}
      />
      <EntryField
        id={`handoffs-${chatterId}-${weekStart}`}
        label="Handoffs"
        error={err('handoffs')}
        registration={register('handoffs')}
      />

      <EntryStatus status={status} rowLabel={`Semaine du ${weekLabel}`} />

      {errors.root?.serverError && (
        <p role="alert" className="col-span-2 text-sm text-red-600 sm:col-span-full dark:text-red-400">
          {errors.root.serverError.message}
        </p>
      )}
    </form>
  )
}
