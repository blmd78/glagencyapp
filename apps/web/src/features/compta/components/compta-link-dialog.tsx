'use client'

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ActionButton } from '@/components/action-button'
import { linkChatter } from '../actions'
import { chatterLinkInput, type ChatterLinkInput } from '../schema'

/**
 * Relie un membre à son chatteur MyPuls depuis la compta — ADMIN seul (`canConfigure` côté
 * appelant, `adminGuard` côté serveur, qui est le vrai verrou : le lien s'écrit par client
 * service-role, donc aucune RLS ne le protège).
 *
 * `Combobox` et non `Select` : les options sont les chatteurs MyPuls encore libres, 230
 * mesurés sur l'UAT le 2026-07-27 — une liste déroulante sans recherche y est inutilisable.
 *
 * `'use no memo'` : le React Compiler casse `formState` de RHF (isSubmitting resterait faux,
 * les erreurs ne s'afficheraient pas). Générique simple `useForm<ChatterLinkInput>` — pas de
 * `z.coerce` ici, donc l'entrée du schéma est identique à sa sortie (contrairement à
 * `compta-settings-form.tsx`, qui a besoin du triple générique).
 */
export function ComptaLinkDialog({
  memberId,
  memberName,
  chatters,
}: {
  memberId: string
  memberName: string
  /** Chatteurs MyPuls ENCORE LIBRES (`ComptaData.linkableChatters`). */
  chatters: { id: string; name: string }[]
}) {
  'use no memo'
  const [open, setOpen] = useState(false)

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChatterLinkInput>({
    resolver: zodResolver(chatterLinkInput),
    defaultValues: { memberId, chatterId: '' },
  })

  // Tant qu'aucun chatteur n'est choisi, `chatterId` vaut `''` : le bouton reste désactivé
  // plutôt que de laisser Zod répondre son message d'`uuid` en anglais.
  // `useWatch` et non `watch()` : ce dernier déclenche `react-hooks/incompatible-library`
  // (fonction non mémoïsable) — même choix que `compta-settings-form.tsx`.
  const chosen = useWatch({ control, name: 'chatterId' })

  const submit = handleSubmit(async (values) => {
    const res = await linkChatter(values)
    if (!res.success) {
      // `applyChatterLink` peut refuser sur le champ (`chatterId: ['Déjà lié ailleurs.']`)
      // quand un autre membre a pris ce chatteur entre l'affichage et le clic.
      const fieldMessage = res.fieldErrors?.chatterId?.[0]
      if (fieldMessage) setError('chatterId', { message: fieldMessage })
      setError('root.serverError', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(`${memberName} relié à MyPuls`)
    setOpen(false)
    reset({ memberId, chatterId: '' })
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // Refermer sans valider ne doit pas garder l'erreur du refus précédent.
        if (!o) reset({ memberId, chatterId: '' })
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs">
          <Link2 className="size-3.5" />
          Relier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Relier {memberName} à MyPuls</DialogTitle>
          <DialogDescription>
            Sans ce lien, aucun CA n&apos;est calculable pour ce membre. Seuls les chatteurs
            MyPuls non encore reliés sont proposés.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <Controller
            control={control}
            name="chatterId"
            render={({ field }) => (
              <Combobox
                options={chatters.map((c) => ({ value: c.id, label: c.name }))}
                value={field.value}
                onChange={field.onChange}
                placeholder="Choisir un chatter MyPuls…"
                searchPlaceholder="Rechercher un chatter…"
                emptyText="Aucun chatter libre."
                disabled={isSubmitting}
                aria-invalid={!!errors.chatterId}
              />
            )}
          />
          {errors.chatterId && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.chatterId.message}</p>
          )}
          {errors.root?.serverError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.root.serverError.message}
            </p>
          )}
          <DialogFooter>
            <ActionButton type="submit" pending={isSubmitting} disabled={!chosen}>
              Relier
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
