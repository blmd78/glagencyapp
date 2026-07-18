'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { upsertReport, deleteTodayReport } from '../actions'
import { upsertReportInput, type UpsertReportInput } from '../schema'

/**
 * Rédaction de SON compte rendu DU JOUR (le seul modifiable — les jours passés sont figés).
 * `initialContent` = le CR du jour s'il existe déjà (édition) ; vide sinon (nouveau jour).
 * Suppression proposée uniquement s'il y a un CR à supprimer, et seulement pour aujourd'hui.
 */
export function ReportForm({ initialContent }: { initialContent: string }) {
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
      <div className="flex items-center justify-end gap-2">
        {initialContent && (
          <ConfirmDialog
            title="Supprimer le compte rendu d'aujourd'hui ?"
            description="Seul le compte rendu du jour peut être supprimé."
            trigger={
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-red-600 hover:text-red-700">
                <Trash2 className="size-3.5" />
                Supprimer
              </Button>
            }
            onConfirm={async () => {
              const res = await deleteTodayReport()
              if (!res.success) {
                toast.error(res.error)
                return res.error
              }
              toast.success('Compte rendu supprimé')
            }}
          />
        )}
        <ActionButton type="submit" pending={isSubmitting}>
          Enregistrer
        </ActionButton>
      </div>
    </form>
  )
}
