'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { callAction } from '@/lib/actions-client'
import { grantAttempts } from '../actions'
import { grantAttemptsInput, type GrantAttemptsValues } from '../schema'

/**
 * « + N · Redonner » sur un exercice de la fiche chatteur (0161) : l'encadrant a expliqué, il
 * redonne des essais. 1 par défaut. La trace (qui, quand, combien) est la ligne écrite par l'action.
 */
export function GrantAttempts({ profileId, caseId }: { profileId: string; caseId: string }) {
  'use no memo' // RHF : formState est un Proxy à abonnement, le React Compiler le figerait.
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<GrantAttemptsValues>({
    resolver: zodResolver(grantAttemptsInput),
    defaultValues: { profileId, caseId, extra: 1 },
  })

  const onSubmit = handleSubmit(async (values) => {
    const r = await callAction(grantAttempts(values))
    if (!r.success) {
      toast.error(r.error)
      return
    }
    const n = Number(values.extra)
    toast.success(`${n} essai${n > 1 ? 's' : ''} redonné${n > 1 ? 's' : ''}`)
    reset({ profileId, caseId, extra: 1 })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex items-center gap-1">
      <Input
        type="number"
        min={1}
        max={20}
        aria-label="Essais à redonner"
        title={errors.extra?.message}
        aria-invalid={!!errors.extra}
        disabled={isSubmitting}
        className="h-7 w-14 px-2 text-xs"
        {...register('extra', { valueAsNumber: true })}
      />
      <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={isSubmitting}>
        Redonner
      </Button>
    </form>
  )
}
