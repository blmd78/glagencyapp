'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ActionButton } from '@/components/action-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Schéma du FORMULAIRE — miroir de la partie identité de `submitCandidateInput` (`../schema`),
 * sans `attemptId` (il vient de l'état du parcours, pas d'une saisie) ni les normalisations
 * serveur (minuscules, `''` → `null`) qui n'ont rien à faire dans un resolver client. Les bornes
 * sont volontairement IDENTIQUES à celles du serveur : le candidat voit l'erreur avant l'envoi,
 * et l'action revalide de toute façon.
 */
const identityForm = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis').max(60, '60 caractères max'),
  lastName: z.string().trim().min(1, 'Nom requis').max(60, '60 caractères max'),
  email: z.string().trim().pipe(z.email('Email invalide').max(160, '160 caractères max')),
  discord: z.string().trim().max(60, '60 caractères max'),
})

export type IdentityForm = z.infer<typeof identityForm>

/** Ce que le parent rend quand la soumission échoue (`null` = c'est passé, il prend la main). */
export type SubmitFailure = { error: string; fieldErrors?: Record<string, string[]> }

const FIELDS = ['firstName', 'lastName', 'email', 'discord'] as const

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
    defaultValues: { firstName: '', lastName: '', email: '', discord: '' },
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
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
