'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { ActionButton } from '@/components/action-button'
import { upsertReport } from '../actions'
import { upsertReportInput, type UpsertReportInput } from '../schema'

/**
 * Rédaction de SON compte rendu DU JOUR (le seul modifiable — les jours passés sont figés).
 * `initialContent` = le CR du jour s'il existe déjà (édition) ; vide sinon (nouveau jour).
 * Pas de suppression : le jour courant est toujours en édition, on remplace le contenu.
 *
 * `onSaved` : quand le panneau détient les comptes rendus en ÉTAT CLIENT (pile d'accordéons,
 * chargés à la demande), `revalidatePath` ne les rafraîchit PAS — il ne repatche que l'arbre
 * serveur. Sans ce rappel, changer de jour puis revenir remonte le formulaire sur la version
 * d'avant l'enregistrement, et re-sauvegarder écraserait le texte fraîchement écrit. Absent en
 * mode « à plat » : là, les comptes rendus viennent des props serveur et `revalidatePath` suffit.
 */
export function ReportForm({
  initialContent,
  onSaved,
}: {
  initialContent: string
  onSaved?: () => void
}) {
  'use no memo'
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpsertReportInput>({
    resolver: zodResolver(upsertReportInput),
    defaultValues: { content: initialContent },
  })

  const submit = handleSubmit(async (values) => {
    const res = await upsertReport(values)
    if (!res.success) {
      setError('root.serverError', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Compte rendu enregistré')
    onSaved?.()
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
      <Textarea
        rows={6}
        placeholder="Ce que tu as fait aujourd'hui, ce qui bloque, ce qui est prévu demain…"
        {...register('content')}
      />
      {errors.content && (
        <p className="text-sm text-red-600 dark:text-red-400">{errors.content.message}</p>
      )}
      {errors.root?.serverError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errors.root.serverError.message}
        </p>
      )}
      <ActionButton type="submit" pending={isSubmitting} className="self-end">
        Enregistrer
      </ActionButton>
    </form>
  )
}
