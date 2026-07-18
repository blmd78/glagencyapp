'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ActionButton } from '@/components/action-button'
import { upsertReport } from '../actions'
import { upsertReportInput, type UpsertReportInput } from '../schema'
import type { Report } from '../types'

/**
 * Rédaction de SON compte rendu du jour. Journalier : le textarea est vide par défaut chaque
 * nouveau jour (défaut = aujourd'hui, sans CR encore) ; choisir une date qui a déjà un CR le
 * charge pour édition (upsert). Date bornée [J−30, J] (rattrapage possible, futur interdit).
 */
export function ReportForm({ today, minDay, reports }: { today: string; minDay: string; reports: Report[] }) {
  // 1 CR/jour (upsert) → lookup direct, la fenêtre est bornée à ~30 lignes (pas de Map/memo).
  const contentFor = (d: string) => reports.find((r) => r.day === d)?.content ?? ''
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpsertReportInput>({
    resolver: zodResolver(upsertReportInput),
    defaultValues: { day: today, content: contentFor(today) },
  })

  // Changer de date charge le CR existant de ce jour (ou vide pour un jour non encore rédigé).
  const dayField = register('day')

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
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="report-day" className="text-sm font-medium">
          Compte rendu du
        </label>
        <Input
          id="report-day"
          type="date"
          min={minDay}
          max={today}
          className="h-9 w-44"
          {...dayField}
          onChange={(e) => {
            void dayField.onChange(e)
            setValue('content', contentFor(e.target.value))
          }}
        />
      </div>
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
