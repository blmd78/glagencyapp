'use client'

import type { ReactNode } from 'react'
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
 *
 * Le champ e-mail expose en plus un `onEmailBlur` + un `emailNotice` : c'est le dialog qui va
 * chercher le dossier de recrutement de cet e-mail et compose l'encart — ce composant reste
 * bête, il ne fait que placer les deux au bon endroit.
 */
export function MemberIdentityFields({
  register,
  errors,
  emailLocked,
  isSubmitting,
  onEmailBlur,
  emailNotice,
}: {
  register: UseFormRegister<MemberForm>
  errors: FieldErrors<MemberForm>
  /** Édition : l'email n'est plus modifiable (identifiant du compte auth). */
  emailLocked: boolean
  isSubmitting: boolean
  /** Notifié APRÈS le `onBlur` de RHF (validation d'abord) — création seulement, cf. dialog. */
  onEmailBlur?: (email: string) => void
  /** Encart sous le champ (dossier de recrutement trouvé) — le dialog décide de son contenu. */
  emailNotice?: ReactNode
}) {
  'use no memo'
  // `register` rend son propre `onBlur` : on le garde et on chaîne le nôtre APRÈS (le spread
  // serait sinon écrasé par la prop qui le suit, et le champ ne se validerait plus au blur).
  const emailField = register('email')
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
          {...emailField}
          onBlur={(e) => {
            emailField.onBlur(e)
            onEmailBlur?.(e.target.value)
          }}
        />
        {errors.email && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>
        )}
        {emailNotice}
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
