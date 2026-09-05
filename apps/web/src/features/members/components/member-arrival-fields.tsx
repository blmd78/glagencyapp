'use client'

import { Controller, type Control, type UseFormGetValues, type UseFormSetValue } from 'react-hook-form'
import { todayParis } from '@glagency/core'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { MemberForm } from '../schema'

/**
 * ARRIVÉE DU CHATTEUR : le drapeau manuel « nouvel arrivant », la date d'arrivée réelle (0101) et
 * le drapeau « en formation » (0147). Masqué pour les autres rôles — le serveur force
 * `is_new = false` / `arrived_at = null` / `in_training = false`.
 *
 * FICHIER À PART, et pas dans `member-closing-fields.tsx` : le closing dit COMMENT le chatteur est
 * payé (setter/closer/équipe), l'arrivée dit DEPUIS QUAND il est là. Deux responsabilités, deux
 * fichiers (norme `guidelines-standard-feature.md` §1).
 *
 * « NOUVEL ARRIVANT » et pas « Nouveau » : le sélecteur « Rôle closing » voisin propose déjà une
 * option `Nouveau` (`CRM_ROLES`, 0090, légende de la feuille de paie). Deux champs « Nouveau » sur
 * la même ligne seraient illisibles. Le badge affiché dans le reste de l'app, lui, dit « Nouveau ».
 *
 * MANUEL par nécessité : `created_at` ne dit pas quand la personne est arrivée dans l'agence — un
 * chatteur peut être créé tardivement dans le CRM alors qu'il travaille depuis deux mois. Cocher
 * PROPOSE la date du jour ; elle reste modifiable, c'est tout l'intérêt.
 */
export function MemberArrivalFields({
  control,
  roleValue,
  isNewValue,
  isSubmitting,
  getValues,
  setValue,
}: {
  control: Control<MemberForm>
  roleValue: MemberForm['role']
  /** Observé par le dialog (`useWatch`) : commande l'affichage du champ date. */
  isNewValue: boolean
  isSubmitting: boolean
  getValues: UseFormGetValues<MemberForm>
  setValue: UseFormSetValue<MemberForm>
}) {
  'use no memo'
  if (roleValue !== 'chatteur') return null
  return (
    <div className="flex flex-wrap items-start gap-4">
      <Controller
        name="isNew"
        control={control}
        render={({ field }) => (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Arrivée
            </label>
            <div className="flex h-9 items-center gap-2">
              <Checkbox
                id="member-is-new"
                checked={field.value}
                disabled={isSubmitting}
                // Cocher propose aujourd'hui SANS écraser une date déjà saisie ; décocher garde la
                // date en base (elle sert au calcul d'ancienneté) et masque simplement le champ.
                onCheckedChange={(v) => {
                  const on = v === true
                  field.onChange(on)
                  if (on && !getValues('arrivedAt')) setValue('arrivedAt', todayParis())
                }}
              />
              <label htmlFor="member-is-new" className="text-sm">
                Nouvel arrivant
              </label>
            </div>
          </div>
        )}
      />
      {isNewValue && (
        <Controller
          name="arrivedAt"
          control={control}
          render={({ field, fieldState }) => (
            <div className="grid gap-1.5">
              <label
                htmlFor="member-arrived-at"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Arrivé le
              </label>
              {/* `<Input type="date">` = la saisie de date de ce dialog même (onglet Compta,
                  `member-pay-form.tsx`) et de Rapports/Insights. Le `Calendar` Radix sert aux
                  PLAGES (`date-range-picker.tsx`) et au jour de sanction du Tracker
                  (`police/components/day-picker.tsx`, fenêtre bornée à 14 j). */}
              <Input
                id="member-arrived-at"
                type="date"
                className="h-9 w-40 text-sm"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                disabled={isSubmitting}
              />
              {fieldState.error && (
                <p role="alert" className="text-xs text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </div>
          )}
        />
      )}
      {/* EN FORMATION (0147) — le drapeau qui décide de l'onglet où la personne apparaît sur
          l'Overview de la face Formation. Coché d'origine à la création (`member-defaults.ts`) et
          à l'intégration depuis Recrutement ; il tombe TOUT SEUL au premier rattachement à une
          modèle (trigger `profile_creators_clear_in_training`), y compris depuis le board
          Organisation. On le laisse modifiable pour les deux cas que le trigger ne couvre pas :
          sortir quelqu'un de formation sans lui donner de modèle, et l'y remettre. */}
      <Controller
        name="inTraining"
        control={control}
        render={({ field }) => (
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Formation
            </label>
            <div className="flex h-9 items-center gap-2">
              <Checkbox
                id="member-in-training"
                checked={field.value}
                disabled={isSubmitting}
                onCheckedChange={(v) => field.onChange(v === true)}
              />
              <label htmlFor="member-in-training" className="text-sm">
                En formation
              </label>
            </div>
          </div>
        )}
      />
    </div>
  )
}
