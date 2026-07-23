'use client'

import type { FormEventHandler } from 'react'
import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { PAYMENT_OPTIONS, type StaffForm } from '../schema'
import { MultiPicker } from './multi-picker'
import type { MktStaffData, MktStaffRow } from '../types'

/**
 * Dialog fiche VA (création/édition) — présentation pure : l'état (`editing`, `useForm`,
 * `submit`) vit dans `VaView` (dialog PARTAGÉ, pas une instance par ligne — cf.
 * `va-columns.tsx`). Découpé pour ramener `va-view.tsx` sous 300 lignes
 * (docs/guidelines-standard-feature.md « split > 300 l. »), DOM identique à l'original.
 */
export function VaFormDialog({
  editing,
  colors,
  linkOptions,
  igOptions,
  twOptions,
  register,
  control,
  errors,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  editing: MktStaffRow | 'new' | null
  colors: readonly string[]
  linkOptions: MktStaffData['linkOptions']
  igOptions: MktStaffData['igOptions']
  twOptions: MktStaffData['twOptions']
  register: UseFormRegister<StaffForm>
  control: Control<StaffForm>
  errors: FieldErrors<StaffForm>
  isSubmitting: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  onClose: () => void
}) {
  'use no memo'
  const numField = (
    label: string,
    key: 'fixedEur' | 'rateTw' | 'rateIg' | 'bonusEur',
    step = '0.01',
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${key}`}>{label}</Label>
      <Input
        id={`f-${key}`}
        type="number"
        step={step}
        disabled={isSubmitting}
        {...register(key, { valueAsNumber: true })}
      />
      {errors[key] && (
        <p className="text-xs text-red-600 dark:text-red-400">{errors[key]?.message}</p>
      )}
    </div>
  )

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editing !== 'new' && editing ? `Modifier ${editing.name}` : 'Nouveau VA'}
          </DialogTitle>
          <DialogDescription>
            Associe ses liens MyPuls et ses comptes : subs et vues remontent ensuite tout
            seuls, la paye se calcule en Compta.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          {/* Pas de champ Rôle : tout ce qui se crée ici est un VA — le manager est
              un profil CRM (page Membres) et possède ses fiches via owner_id. */}
          <div className="grid gap-1.5">
            <Label htmlFor="f-name">Prénom / nom</Label>
            <Input id="f-name" disabled={isSubmitting} {...register('name')} />
            {errors.name && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>
            )}
          </div>
          <Controller
            name="color"
            control={control}
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label>Couleur</Label>
                <div className="flex gap-1.5">
                  {colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={isSubmitting}
                      aria-label={`Couleur ${c}`}
                      className={cn(
                        'size-6 rounded-full border-2',
                        field.value === c ? 'border-foreground' : 'border-transparent',
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => field.onChange(c)}
                    />
                  ))}
                </div>
              </div>
            )}
          />
          <div className="grid gap-3">
            <Controller
              name="linkIds"
              control={control}
              render={({ field }) => (
                <MultiPicker
                  label="Liens MyPuls Twitter — prime subs (prioritaire)"
                  options={linkOptions.map((l) => ({
                    id: l.id,
                    label: l.type === 'twitter' ? l.name : `${l.name} · ${l.type}`,
                  }))}
                  selected={field.value}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
              )}
            />
            <Controller
              name="igAccountIds"
              control={control}
              render={({ field }) => (
                <MultiPicker
                  label="Comptes Instagram gérés — prime vues reels"
                  options={igOptions.map((a) => ({ id: a.id, label: `@${a.handle}` }))}
                  selected={field.value}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
              )}
            />
            <Controller
              name="twAccountIds"
              control={control}
              render={({ field }) => (
                <MultiPicker
                  label="Comptes Twitter suivis — affichage uniquement"
                  options={twOptions.map((a) => ({ id: a.id, label: `@${a.handle}` }))}
                  selected={field.value}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              Subs Twitter et vues Instagram remontent seuls des liens/comptes associés. Les
              comptes Twitter suivis sont indicatifs (aucun impact sur la paye).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {numField('Fixe €/mois', 'fixedEur', '1')}
            <Controller
              name="paymentMethod"
              control={control}
              render={({ field }) => (
                <div className="grid gap-1.5">
                  <Label>Moyen de paiement</Label>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_OPTIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {numField('€ / sub', 'rateTw')}
            {numField('€ / 1k vues', 'rateIg', '0.001')}
            {numField('Prime exceptionnelle €', 'bonusEur', '1')}
          </div>
          {errors.root && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Annuler
            </Button>
            <ActionButton type="submit" pending={isSubmitting}>
              Enregistrer
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
