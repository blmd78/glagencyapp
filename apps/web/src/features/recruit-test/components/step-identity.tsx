'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ActionButton } from '@/components/action-button'
import { FieldError } from '@/components/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { identityForm, RECRUIT_SHIFTS, type IdentityFormValues } from '../schema'

/**
 * Le resolver est le schéma PARTAGÉ `identityForm` (`../schema`) : mêmes bornes ici et dans
 * `submitCandidateInput`, qui l'étend avec `attemptId` et les normalisations serveur (minuscules,
 * `''` → `null`). Le candidat voit donc exactement l'erreur que l'action lui rendrait.
 */
export type IdentityForm = IdentityFormValues

/** Ce que le parent rend quand la soumission échoue (`null` = c'est passé, il prend la main). */
export type SubmitFailure = { error: string; fieldErrors?: Record<string, string[]> }

const FIELDS = ['firstName', 'lastName', 'email', 'discord', 'age', 'location', 'phone', 'shifts', 'source'] as const

/** Emoji d'affichage par shift (GLA) — purement décoratif, la valeur stockée reste le libellé. */
const SHIFT_EMOJI: Record<(typeof RECRUIT_SHIFTS)[number], string> = {
  'Matin (5h–13h)': '🌅',
  'Après-midi (13h–21h)': '☀️',
  'Nuit (21h–5h)': '🌙',
}

/**
 * Dernière étape : l'identité, demandée À LA FIN (écart voulu vs GLA, spec §1) — le test est déjà
 * joué, ces champs ne servent qu'à créer le dossier et à recontacter le candidat.
 */
export function StepIdentity({ onSubmit }: { onSubmit: (values: IdentityForm) => Promise<SubmitFailure | null> }) {
  'use no memo'
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<IdentityForm>({
    resolver: zodResolver(identityForm),
    defaultValues: { firstName: '', lastName: '', email: '', discord: '', age: '', location: '', phone: '', shifts: [], source: '' },
  })

  const submit = handleSubmit(async (values) => {
    const failure = await onSubmit(values)
    if (!failure) return
    for (const field of FIELDS) {
      const message = failure.fieldErrors?.[field]?.[0]
      if (message) setError(field, { message })
    }
    setError('root', { message: failure.error })
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Presque fini</h2>
        <p className="text-sm text-muted-foreground">
          Laisse-nous tes coordonnées pour qu’on puisse revenir vers toi avec le résultat.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="Prénom" error={errors.firstName?.message}>
          <Input id="firstName" autoComplete="given-name" aria-invalid={!!errors.firstName} {...register('firstName')} />
        </Field>
        <Field id="lastName" label="Nom" error={errors.lastName?.message}>
          <Input id="lastName" autoComplete="family-name" aria-invalid={!!errors.lastName} {...register('lastName')} />
        </Field>
      </div>

      <Field id="email" label="Adresse e-mail" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" placeholder="ton@email.fr" aria-invalid={!!errors.email} {...register('email')} />
      </Field>

      <Field id="discord" label="Pseudo Discord (optionnel)" error={errors.discord?.message}>
        <Input id="discord" placeholder="monpseudo" aria-invalid={!!errors.discord} {...register('discord')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="age" label="Âge" error={errors.age?.message}>
          <Input id="age" type="number" inputMode="numeric" min={18} max={99} placeholder="ex : 22" aria-invalid={!!errors.age} {...register('age')} />
        </Field>
        <Field id="phone" label="Numéro de téléphone" error={errors.phone?.message}>
          <Input id="phone" type="tel" autoComplete="tel" placeholder="ex : 06 12 34 56 78" aria-invalid={!!errors.phone} {...register('phone')} />
        </Field>
      </div>

      <Field id="location" label="Localisation (ville, pays)" error={errors.location?.message}>
        <Input id="location" autoComplete="address-level2" placeholder="ex : Paris, France" aria-invalid={!!errors.location} {...register('location')} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Sur quels shifts es-tu disponible ? <span className="font-normal text-muted-foreground">(plusieurs choix possibles)</span></legend>
        {RECRUIT_SHIFTS.map((s) => (
          <label key={s} className="flex items-center gap-3 text-sm">
            {/* Checkbox NATIF : plusieurs cases sur le même `name` ⇒ RHF rend un tableau de valeurs. */}
            <input type="checkbox" value={s} className="size-4 accent-primary" {...register('shifts')} />
            <span>{SHIFT_EMOJI[s]} {s}</span>
          </label>
        ))}
        <FieldError message={errors.shifts?.message} />
      </fieldset>

      <Field id="source" label="Comment as-tu connu l’agence ?" error={errors.source?.message}>
        <Input id="source" placeholder="ex : par un ami, TikTok, une annonce…" aria-invalid={!!errors.source} {...register('source')} />
      </Field>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <ActionButton type="submit" className="w-full" pending={isSubmitting}>
        Envoyer ma candidature
      </ActionButton>
    </form>
  )
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError message={error} />
    </div>
  )
}
