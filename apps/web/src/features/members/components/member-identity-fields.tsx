'use client'

import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import type { MemberForm } from '../schema'

/**
 * Identité du membre : email, nom affiché, lien « outil de travail ». Les trois champs texte du
 * haut du formulaire, EXTRAITS tels quels de `member-dialog.tsx` le 2026-07-28 quand l'onglet
 * Compta l'a fait franchir les 300 lignes (CLAUDE.md) — même découpe que
 * `member-access-fields.tsx` / `member-permission-fields.tsx`, aucun changement de rendu.
 *
 * `register` plutôt que `control` : ce sont des `<input>` non contrôlés, contrairement aux
 * `Select`/cases à cocher des autres blocs qui passent par `Controller`.
 */
export function MemberIdentityFields({
  register,
  errors,
  emailLocked,
  isSubmitting,
}: {
  register: UseFormRegister<MemberForm>
  errors: FieldErrors<MemberForm>
  /** Édition : l'email n'est plus modifiable (identifiant du compte auth). */
  emailLocked: boolean
  isSubmitting: boolean
}) {
  'use no memo'
  return (
    <>
      <div className="grid gap-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Email
        </label>
        <Input
          type="email"
          placeholder="prenom@exemple.fr"
          disabled={emailLocked || isSubmitting}
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>
        )}
      </div>
      <div className="grid gap-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Nom affiché
        </label>
        <Input placeholder="Marco" disabled={isSubmitting} {...register('displayName')} />
        {errors.displayName && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.displayName.message}</p>
        )}
      </div>
      <div className="grid gap-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Lien outil de travail (optionnel)
        </label>
        <Input
          type="url"
          placeholder="https://notion.so/…"
          disabled={isSubmitting}
          {...register('workLink')}
        />
        <p className="text-xs text-muted-foreground">
          Le membre le retrouve dans son menu utilisateur, en bas de la sidebar.
        </p>
        {errors.workLink && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.workLink.message}</p>
        )}
      </div>
    </>
  )
}
