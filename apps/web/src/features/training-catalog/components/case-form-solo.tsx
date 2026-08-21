'use client'

import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SPEAKERS, SPEAKER_LABELS } from '@/lib/types/training'
import type { CaseFormValues, CaseInput } from '../schema'

export type CaseFormProps = {
  control: Control<CaseFormValues, unknown, CaseInput>
  register: UseFormRegister<CaseFormValues>
  errors: FieldErrors<CaseFormValues>
  disabled?: boolean
}

/** Partie SOLO du dialog cas : le fan (IA), les messages d'ouverture, l'attendu (révélé après). */
export function CaseFormSolo({ control, register, errors, disabled }: CaseFormProps) {
  'use no memo'
  const { fields, append, remove, swap } = useFieldArray({ control, name: 'messages' })
  return (
    <>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Le fan</legend>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor="case-fan-name">Prénom du fan</Label>
            <Input id="case-fan-name" placeholder="Tony" disabled={disabled} aria-invalid={!!errors.fanName} {...register('fanName')} />
            <FieldError message={errors.fanName?.message} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="case-fan-brief">Consigne du fan (pour l’IA)</Label>
          <Textarea id="case-fan-brief" rows={5} disabled={disabled} aria-invalid={!!errors.fanBrief} {...register('fanBrief')} />
          <p className="text-xs text-muted-foreground">Pilote l’IA qui joue le fan — jamais montrée au chatter.</p>
          <FieldError message={errors.fanBrief?.message} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium">Ouverture — la conversation déjà entamée</legend>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => append({ speaker: 'fan', body: '' })}>
            <Plus className="size-4" /> Ajouter un message
          </Button>
        </div>
        <FieldError message={errors.messages?.message ?? errors.messages?.root?.message} />
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun message : le chatter démarre la conversation.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fields.map((f, i) => (
              <li key={f.id} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[8rem_1fr_auto]">
                <Controller
                  name={`messages.${i}.speaker`}
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                      <SelectTrigger aria-label="Qui parle"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SPEAKERS.map((s) => <SelectItem key={s} value={s}>{SPEAKER_LABELS[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
                <div className="grid gap-1">
                  <Textarea rows={2} placeholder="Texte du message…" disabled={disabled} aria-invalid={!!errors.messages?.[i]?.body} {...register(`messages.${i}.body`)} />
                  <FieldError message={errors.messages?.[i]?.body?.message} />
                </div>
                <div className="flex items-start gap-0.5">
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Monter" disabled={disabled || i === 0} onClick={() => swap(i, i - 1)}><ArrowUp className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Descendre" disabled={disabled || i === fields.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Retirer le message" disabled={disabled} onClick={() => remove(i)}><Trash2 className="size-3.5" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Après coup</legend>
        <Label htmlFor="case-expected">Ce qui était attendu</Label>
        <Textarea id="case-expected" rows={4} disabled={disabled} aria-invalid={!!errors.expected} {...register('expected')} />
        <p className="text-xs text-muted-foreground">Révélé au chatter APRÈS la session, avec sa note.</p>
        <FieldError message={errors.expected?.message} />
      </fieldset>
    </>
  )
}
