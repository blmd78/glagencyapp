'use client'

import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CASE_KINDS, CASE_KIND_LABELS } from '@/lib/types/training'
import { saveCase } from '../actions'
import { caseForm, type CaseFormValues, type CaseInput } from '../schema'
import type { CatalogCase, CatalogModule } from '../types'
import { CaseFormArena } from './case-form-arena'
import { CaseFormBoss, emptyFan } from './case-form-boss'
import { CaseFormSolo } from './case-form-solo'
import { FieldError } from './field-error'

/** Un Select Radix refuse `value=""` → sentinelle pour « sans section » (guidelines §5, piège). */
const NONE = 'none'

const emptyCase = (moduleId: string): CaseFormValues => ({
  id: null, moduleId, kind: 'solo', sectionId: null, title: '', phase: '', difficulty: 3, maxTurns: 8, isSale: false,
  context: '', objective: '', targetLine: '', fanName: '', fanBrief: '', expected: '', messages: [],
  reactionMaxS: '', slots: [], fans: [],
})
const toForm = (c: CatalogCase): CaseFormValues => ({
  id: c.id, moduleId: c.moduleId, kind: c.kind, sectionId: c.sectionId, title: c.title, phase: c.phase,
  difficulty: c.difficulty, maxTurns: c.maxTurns, isSale: c.isSale, context: c.context, objective: c.objective,
  targetLine: c.targetLine ?? '', fanName: c.fanName ?? '', fanBrief: c.fanBrief ?? '', expected: c.expected ?? '',
  messages: c.messages.map((m) => ({ speaker: m.speaker, body: m.body })),
  reactionMaxS: c.reactionMaxS ?? '',
  slots: c.arenaSlots.map((s) => ({ refCaseId: s.refCaseId, displayName: s.displayName })),
  fans: c.bossFans.map((f) => ({
    name: f.name, age: f.age ?? '', job: f.job ?? '', city: f.city ?? '', color: f.color ?? '', persona: f.persona,
    openingMessage: f.openingMessage, budgetCap: f.budgetCap ?? '', negoThreshold: f.negoThreshold ?? '',
    negoWhere: f.negoWhere ?? '', meetWhen: f.meetWhen ?? '', meetWhere: f.meetWhere ?? '', derails: f.derails ?? '',
  })),
})
const emptySlots = () => Array.from({ length: 5 }, () => ({ refCaseId: '', displayName: '' }))

/**
 * Dialog Nouveau / Modifier cas. La SORTE se choisit à la création (solo / défi simultané / boss
 * final) et ne se change plus ensuite (le sélecteur est verrouillé en édition ; l'action le
 * re-vérifie). Sections dans l'ordre où le chatter les rencontre : Identité · Ce que voit le
 * chatter · puis la partie propre à la sorte. Reset à chaque ouverture.
 */
export function CaseDialog({
  open,
  module,
  caseItem,
  onClose,
}: {
  open: boolean
  module: CatalogModule
  /** null = création dans `module`. */
  caseItem: CatalogCase | null
  onClose: () => void
}) {
  'use no memo'
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CaseFormValues, unknown, CaseInput>({
    resolver: zodResolver(caseForm),
    defaultValues: caseItem ? toForm(caseItem) : emptyCase(module.id),
  })
  useEffect(() => {
    if (open) reset(caseItem ? toForm(caseItem) : emptyCase(module.id))
  }, [open, caseItem, module.id, reset])
  const kind = useWatch({ control, name: 'kind' })

  // Passage à une sorte multi-conversations : on amorce ce que le superRefine exigera.
  const onKindChange = (k: CaseFormValues['kind']) => {
    setValue('kind', k)
    if (k !== 'solo' && (getValues('reactionMaxS') === '' || getValues('reactionMaxS') == null)) setValue('reactionMaxS', 120)
    if (k === 'arena' && getValues('slots').length !== 5) setValue('slots', emptySlots())
    if (k === 'boss' && getValues('fans').length === 0) setValue('fans', [emptyFan()])
  }

  const soloOptions = module.cases
    .filter((c) => c.kind === 'solo')
    .map((c) => ({ value: c.id, label: `${c.title} (diff. ${c.difficulty})` }))

  const submit = handleSubmit(async (values) => {
    const res = await saveCase(values)
    if (!res.success) {
      for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
        const message = messages?.[0]
        if (message && (field === 'sectionId' || field === 'slots')) setError(field, { message })
      }
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(caseItem ? 'Cas modifié' : 'Cas créé')
    onClose()
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{caseItem ? `Modifier « ${caseItem.title} »` : `Nouveau cas — ${module.title}`}</DialogTitle>
          <DialogDescription>
            {caseItem ? 'La sorte du cas ne se change pas.' : 'Choisis d’abord la sorte : elle ne se change plus ensuite. Le cas est ajouté en fin de module.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Identité</legend>
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <div className="grid gap-1.5">
                <Label>Sorte</Label>
                <Select value={kind} onValueChange={(v) => onKindChange(v as CaseFormValues['kind'])} disabled={isSubmitting || !!caseItem}>
                  <SelectTrigger aria-label="Sorte du cas"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CASE_KINDS.map((k) => <SelectItem key={k} value={k}>{CASE_KIND_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="case-title">Titre</Label>
                <Input id="case-title" disabled={isSubmitting} aria-invalid={!!errors.title} {...register('title')} />
                <FieldError message={errors.title?.message} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="case-phase">Phase (étiquette)</Label>
                <Input id="case-phase" placeholder="Qualification" disabled={isSubmitting} {...register('phase')} />
                <FieldError message={errors.phase?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="case-diff">Difficulté (1-10)</Label>
                <Input id="case-diff" type="number" min={1} max={10} disabled={isSubmitting} aria-invalid={!!errors.difficulty} {...register('difficulty')} />
                <FieldError message={errors.difficulty?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="case-turns">Messages max{kind === 'boss' ? ' (par fan)' : ''}</Label>
                <Input id="case-turns" type="number" min={1} max={50} disabled={isSubmitting} aria-invalid={!!errors.maxTurns} {...register('maxTurns')} />
                <FieldError message={errors.maxTurns?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label>Section</Label>
                <Controller
                  name="sectionId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)} disabled={isSubmitting || module.sections.length === 0}>
                      <SelectTrigger aria-label="Section"><SelectValue placeholder="Sans section" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sans section</SelectItem>
                        {module.sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.emoji ? `${s.emoji} ` : ''}{s.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.sectionId?.message} />
              </div>
            </div>
            <Controller
              name="isSale"
              control={control}
              render={({ field }) => (
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={isSubmitting} />
                  Le cas attend une vente
                </label>
              )}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Ce que voit le chatter</legend>
            <div className="grid gap-1.5">
              <Label htmlFor="case-context">Contexte (situation de départ)</Label>
              <Textarea id="case-context" rows={3} disabled={isSubmitting} aria-invalid={!!errors.context} {...register('context')} />
              <FieldError message={errors.context?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="case-objective">{module.objectiveLabel}</Label>
              <Textarea id="case-objective" rows={2} disabled={isSubmitting} aria-invalid={!!errors.objective} {...register('objective')} />
              <FieldError message={errors.objective?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="case-target">Ligne cible (facultatif)</Label>
              <Input id="case-target" disabled={isSubmitting} {...register('targetLine')} />
              <FieldError message={errors.targetLine?.message} />
            </div>
          </fieldset>

          {kind === 'solo' && <CaseFormSolo control={control} register={register} errors={errors} disabled={isSubmitting} />}
          {kind === 'arena' && <CaseFormArena control={control} register={register} errors={errors} disabled={isSubmitting} soloOptions={soloOptions} />}
          {kind === 'boss' && <CaseFormBoss control={control} register={register} errors={errors} disabled={isSubmitting} />}

          {errors.root && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>}
          {/* `id` et `moduleId` voyagent par les defaultValues (RHF garde les valeurs sans input
              DOM, shouldUnregister=false) — PAS d'<input hidden> : il forcerait `id: null` en ''. */}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Annuler</Button>
            <ActionButton type="submit" pending={isSubmitting}>{caseItem ? 'Enregistrer' : 'Créer le cas'}</ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
