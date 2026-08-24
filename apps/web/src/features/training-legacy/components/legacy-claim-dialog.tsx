'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { claimLegacyAccount } from '../actions'
import { legacyClaimForm, type LegacyClaimForm } from '../schema'

/**
 * Le formulaire de réclamation : deux champs, un bouton, aucun lien « mot de passe oublié »
 * (Good Luck Agency n'a pas de récupération en libre-service).
 *
 * Le dialog reste OUVERT jusqu'au verdict : un import de 399 sessions dure quelques secondes, et
 * l'attente est annoncée dans le bouton. Il ne se ferme qu'au succès.
 *
 * L'erreur serveur s'affiche sur la clé `'root'` avec `role="alert"` — quel que soit le motif, le
 * texte est le même : « Identifiants introuvables. » Le distinguer transformerait ce formulaire en
 * annuaire des 248 logins de l'ancienne plateforme.
 */
export function LegacyClaimDialog({ trigger }: { trigger: React.ReactNode }) {
  // React Compiler casse `formState` (donc le loading ET les erreurs) sur un form RHF.
  'use no memo'
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LegacyClaimForm>({
    resolver: zodResolver(legacyClaimForm),
    defaultValues: { login: '', password: '' },
  })

  const submit = handleSubmit(async (values) => {
    let res
    try {
      res = await claimLegacyAccount(values)
    } catch {
      // Échec de TRANSPORT : la Server Action n'a pas pu répondre — typiquement le dépassement de
      // `maxDuration` sur un très gros historique. L'état est RÉCUPÉRABLE (la réservation est
      // posée, `last_sync_at` reste null) et le dire transforme un incident en un clic.
      setError('root', {
        message: 'Récupération interrompue — une partie de votre historique est déjà en place. Relancez pour terminer.',
      })
      return
    }
    if (!res.success) {
      setError('root', { message: res.error })
      return
    }
    toast.success(res.data.message)
    // Le mot de passe ne survit pas au dialog : `reset` le purge de l'état du formulaire.
    reset({ login: '', password: '' })
    setOpen(false)
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset({ login: '', password: '' })
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Récupérer mon historique</DialogTitle>
          <DialogDescription>
            Vos identifiants de l’ancienne plateforme d’entraînement. Ils ne sont pas conservés :
            ils servent une seule fois, à prouver que ce compte est le vôtre.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gla-login">Identifiant sur l’ancienne plateforme</Label>
            <Input
              id="gla-login"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={isSubmitting}
              {...register('login')}
            />
            {errors.login && <p className="text-sm text-red-600 dark:text-red-400">{errors.login.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gla-password">Mot de passe sur l’ancienne plateforme</Label>
            <Input
              id="gla-password"
              type="password"
              autoComplete="off"
              disabled={isSubmitting}
              {...register('password')}
            />
            {errors.password && <p className="text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>}
          </div>

          {errors.root && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.root.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Annuler
            </Button>
            <ActionButton type="submit" pending={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? 'Récupération en cours…' : 'Récupérer mon historique'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
