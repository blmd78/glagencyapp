'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { todayParis } from '@glagency/core'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ActionButton } from '@/components/action-button'
import { recordDeparture } from '../actions'
import { departureInput, type DepartureForm } from '../schema'
import { DEPARTURE_REASONS, type Member } from '../types'

/**
 * ENREGISTRER UN DÉPART — ce qui remplace la suppression pour un vrai départ (0102).
 *
 * Le compte est désactivé (ban GoTrue) mais le profil RESTE : c'est lui qui porte le turnover.
 * L'encart le dit explicitement, parce que le geste part du bouton qui supprimait jusqu'ici et
 * que la différence entre « désactiver » et « supprimer » doit être lue avant de cliquer.
 *
 * Le motif est requis (miroir du check SQL) : sans lui, le taux se calcule mais ne s'interprète
 * pas. L'acteur n'est pas saisi — le serveur pose `caller.id`.
 */
export function MemberDepartureDialog({
  member,
  trigger,
}: {
  member: Member
  trigger: ReactNode
}) {
  'use no memo'
  const [open, setOpen] = useState(false)
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DepartureForm>({
    resolver: zodResolver(departureInput),
    defaultValues: {
      id: member.id,
      leftAt: todayParis(),
      leftReason: 'demission',
      leftNote: '',
    },
  })

  // Réinitialise à L'OUVERTURE : le composant reste monté d'une ouverture à l'autre, sans ça un
  // départ abandonné en cours de saisie réapparaîtrait sur le membre suivant. Même règle que
  // `member-dialog.tsx`, et la date se recalcule au passage (un dialog laissé ouvert la nuit
  // proposerait sinon la veille).
  useEffect(() => {
    if (open) reset({ id: member.id, leftAt: todayParis(), leftReason: 'demission', leftNote: '' })
  }, [open, member.id, reset])

  const submit = handleSubmit(async (values) => {
    const res = await recordDeparture(values)
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(`Départ de ${member.displayName} enregistré`)
    setOpen(false)
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Départ de {member.displayName}</DialogTitle>
          <DialogDescription>
            Son compte sera désactivé : il ne pourra plus se connecter. Son profil et son
            historique sont conservés.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="departure-date" className="text-xs uppercase tracking-wide text-muted-foreground">
                Parti le
              </Label>
              <Input
                id="departure-date"
                type="date"
                className="h-9 w-40 text-sm"
                disabled={isSubmitting}
                {...register('leftAt')}
              />
              {errors.leftAt && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.leftAt.message}
                </p>
              )}
            </div>

            <Controller
              name="leftReason"
              control={control}
              render={({ field }) => (
                <div className="grid gap-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Motif
                  </Label>
                  {/* Radix Select → Controller, jamais `register` : il ne wrappe pas d'<input>. */}
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTURE_REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="departure-note" className="text-xs uppercase tracking-wide text-muted-foreground">
              Commentaire (optionnel)
            </Label>
            <Textarea
              id="departure-note"
              rows={2}
              placeholder="Parti chez un concurrent, problème d'assiduité…"
              disabled={isSubmitting}
              {...register('leftNote')}
            />
            {errors.leftNote && (
              <p role="alert" className="text-xs text-destructive">
                {errors.leftNote.message}
              </p>
            )}
          </div>

          {errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {errors.root.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Annuler
            </Button>
            <ActionButton type="submit" pending={isSubmitting}>
              Enregistrer le départ
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
