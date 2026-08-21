'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { z } from 'zod'
import { ActionButton } from '@/components/action-button'
import { FieldError } from '@/components/field-error'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { reportScore } from '../actions-lifecycle'
import { reportInput } from '../schema'

const reportFields = reportInput.pick({ message: true })
type ReportFields = z.infer<typeof reportFields>

/**
 * « Signaler la note » (session notée, propriétaire, une fois) : un message expliquant ce qui
 * semble faux → un encadrant regarde (Overview). Devient « Note signalée », désactivé, une fois
 * envoyé (`reported`, dérivé de `data.report` par le parent — pas de re-signalement).
 */
export function ReportDialog({ sessionId, reported }: { sessionId: string; reported: boolean }) {
  'use no memo'
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ReportFields>({
    resolver: zodResolver(reportFields),
    defaultValues: { message: '' },
  })

  // Reset à L'OUVERTURE (piège des dialogs, cf. member-departure-dialog.tsx) : le composant reste
  // monté d'une ouverture à l'autre, sans ça un brouillon abandonné réapparaîtrait.
  useEffect(() => {
    if (open) reset({ message: '' })
  }, [open, reset])

  const submit = handleSubmit(async (values) => {
    const res = await reportScore({ sessionId, ...values })
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Signalement envoyé — un encadrant regardera')
    setOpen(false)
    router.refresh()
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && setOpen(o)}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={reported}>
          {reported ? 'Note signalée' : 'Signaler la note'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Signaler cette note</DialogTitle>
          <DialogDescription>Explique ce qui te semble faux — un encadrant la regardera.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="report-message">Ton message</Label>
            <Textarea
              id="report-message"
              rows={4}
              placeholder="Ce qui te semble faux dans cette note…"
              disabled={isSubmitting}
              aria-invalid={!!errors.message}
              {...register('message')}
            />
            <FieldError message={errors.message?.message} />
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
            <ActionButton type="submit" pending={isSubmitting}>
              Envoyer
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
