'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Input } from '@/components/ui/input'
import { callAction } from '@/lib/actions-client'
import { grantLockedAttempts } from '../actions'
import { grantLockedAttemptsInput, type GrantLockedAttemptsValues } from '../schema'

/**
 * « + N · Redonner aux X niveaux bloqués » en tête du Parcours : le même déblocage que la ligne
 * (`GrantAttempts`), sur tous les niveaux épuisés d'un coup. `lockedCount` est celui de la fiche
 * affichée ; le serveur recalcule la liste et le toast dit ce qu'il a réellement fait.
 */
export function GrantLockedAttempts({ profileId, lockedCount }: { profileId: string; lockedCount: number }) {
  'use no memo' // RHF : formState est un Proxy à abonnement, le React Compiler le figerait.
  const router = useRouter()
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<GrantLockedAttemptsValues>({
    resolver: zodResolver(grantLockedAttemptsInput),
    defaultValues: { profileId, extra: 1 },
  })

  const onSubmit = handleSubmit(async (values) => {
    const r = await callAction(grantLockedAttempts(values))
    if (!r.success) {
      toast.error(r.error)
      // Resynchroniser aussi en échec : après une réponse perdue (l'écriture a pu passer) ou un
      // déblocage fait ailleurs, le rejeu répond « Aucun niveau bloqué » — la fiche doit le montrer.
      router.refresh()
      return
    }
    const n = Number(values.extra)
    const c = r.data.count
    toast.success(`${n} essai${n > 1 ? 's' : ''} redonné${n > 1 ? 's' : ''} sur ${c} niveau${c > 1 ? 'x' : ''}`)
    reset({ profileId, extra: 1 })
    // `revalidatePath` seul ne repeint pas la fiche (même constat qu'en aefe77a) : sans ce refresh,
    // les compteurs rouges resteraient affichés jusqu'au rechargement.
    router.refresh()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex items-center gap-1">
      <Input
        type="number"
        min={1}
        max={20}
        aria-label="Essais à redonner sur chaque niveau bloqué"
        title={errors.extra?.message}
        aria-invalid={!!errors.extra}
        disabled={isSubmitting}
        className="h-7 w-14 px-2 text-xs"
        {...register('extra', { valueAsNumber: true })}
      />
      <ActionButton type="submit" size="sm" variant="outline" className="h-7 px-2 text-xs" pending={isSubmitting}>
        Redonner aux {lockedCount} niveau{lockedCount > 1 ? 'x' : ''} bloqué{lockedCount > 1 ? 's' : ''}
      </ActionButton>
    </form>
  )
}
