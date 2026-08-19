'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { WheelSector } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveWheelConfig } from '../actions'
import { wheelConfigForm, type WheelConfigFormValues, type WheelConfigInput } from '../schema'
import type { WheelConfig } from '../types'
import { WheelSvg } from './wheel-svg'

/** Message d'erreur de champ — même rendu que les autres dialogs (Membres, Catalogue). */
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}

/** Un poids saisi (`unknown` : l'input rend une chaîne, Zod coerce) → nombre affichable. */
const asWeight = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}
/** Part d'un poids dans sa liste, en %, arrondie à l'entier — purement indicatif. */
const share = (w: unknown, total: number) => (total > 0 ? `${Math.round((asWeight(w) / total) * 100)} %` : '—')

const toForm = (c: WheelConfig): WheelConfigFormValues => ({
  title: c.title,
  sectors: c.sectors.map((s) => ({ label: s.label, weight: String(s.weight), lose: s.lose })),
  prizes: c.prizes.map((p) => ({ label: p.label, weight: String(p.weight), amountEur: p.amountEur == null ? '' : String(p.amountEur) })),
})

/**
 * Configuration de la roue (admin) : le titre de la page, les SECTEURS (ce que la roue montre —
 * gagnant ou « Raté ») et les LOTS du coffre (ce qu'on gagne quand le secteur est gagnant). Les
 * deux listes sont pondérées : le poids n'est pas un pourcentage, la colonne « % » le calcule.
 * L'aperçu à droite est la vraie roue (`WheelSvg`), redessinée à chaque frappe.
 * Reset à chaque OUVERTURE (piège des dialogs, guidelines §5).
 */
export function WheelConfigDialog({ config }: { config: WheelConfig }) {
  'use no memo'
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WheelConfigFormValues, unknown, WheelConfigInput>({
    resolver: zodResolver(wheelConfigForm),
    defaultValues: toForm(config),
  })
  useEffect(() => {
    if (open) reset(toForm(config))
  }, [open, config, reset])

  const sectors = useFieldArray({ control, name: 'sectors' })
  const prizes = useFieldArray({ control, name: 'prizes' })
  const watchedSectors = useWatch({ control, name: 'sectors' }) ?? []
  const watchedPrizes = useWatch({ control, name: 'prizes' }) ?? []
  const sectorTotal = watchedSectors.reduce((n, s) => n + asWeight(s.weight), 0)
  const prizeTotal = watchedPrizes.reduce((n, p) => n + asWeight(p.weight), 0)
  // Aperçu : les valeurs en cours de saisie, converties au type du domaine.
  const preview: WheelSector[] = watchedSectors.map((s) => ({
    label: String(s.label ?? ''),
    weight: asWeight(s.weight),
    lose: !!s.lose,
  }))

  const submit = handleSubmit(async (values) => {
    const res = await saveWheelConfig(values)
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Roue enregistrée')
    setOpen(false)
    router.refresh()
  })

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Configurer
      </Button>
      <Dialog open={open} onOpenChange={(o) => !isSubmitting && setOpen(o)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Configurer la roue</DialogTitle>
            <DialogDescription>
              La roue tire un SECTEUR ; si le secteur est gagnant, le coffre tire un LOT. Les poids sont relatifs — le pourcentage est calculé.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="wheel-title">Titre de la page</Label>
              <Input id="wheel-title" disabled={isSubmitting} aria-invalid={!!errors.title} {...register('title')} />
              <FieldError message={errors.title?.message} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
              <div className="flex flex-col gap-6">
                <fieldset className="flex flex-col gap-3">
                  <legend className="text-sm font-medium">Secteurs de la roue</legend>
                  <ul className="flex flex-col gap-2">
                    {sectors.fields.map((f, i) => (
                      <li key={f.id} className="flex flex-col gap-1">
                        <div className="grid grid-cols-[1fr_5rem_auto_3rem_auto] items-center gap-2">
                          <Input
                            aria-label={`Libellé du secteur ${i + 1}`}
                            placeholder="Cadeau"
                            disabled={isSubmitting}
                            aria-invalid={!!errors.sectors?.[i]?.label}
                            {...register(`sectors.${i}.label`)}
                          />
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            aria-label={`Poids du secteur ${i + 1}`}
                            disabled={isSubmitting}
                            aria-invalid={!!errors.sectors?.[i]?.weight}
                            {...register(`sectors.${i}.weight`)}
                          />
                          {/* `Controller` (et pas `update()` du fieldArray) : basculer la case ne doit
                              pas remonter la ligne — sinon les <input> perdent le focus en pleine saisie. */}
                          <Controller
                            name={`sectors.${i}.lose`}
                            control={control}
                            render={({ field }) => (
                              <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
                                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={isSubmitting} />
                                Perdant
                              </label>
                            )}
                          />
                          <span className="text-right text-xs tabular-nums text-muted-foreground">{share(watchedSectors[i]?.weight, sectorTotal)}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            aria-label={`Supprimer le secteur ${i + 1}`}
                            disabled={isSubmitting}
                            onClick={() => sectors.remove(i)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                        <FieldError message={errors.sectors?.[i]?.label?.message ?? errors.sectors?.[i]?.weight?.message} />
                      </li>
                    ))}
                  </ul>
                  {/* Erreur de refine (au moins un secteur gagnant de poids > 0) : SOUS la liste
                      qu'elle concerne — c'est la liste entiere qui est en cause, pas une ligne. */}
                  <FieldError message={errors.sectors?.message ?? errors.sectors?.root?.message} />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={isSubmitting} onClick={() => sectors.append({ label: 'Cadeau', weight: '10', lose: false })}>
                      <Plus className="size-4" /> Cadeau
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={isSubmitting} onClick={() => sectors.append({ label: 'Raté', weight: '10', lose: true })}>
                      <Plus className="size-4" /> Raté
                    </Button>
                  </div>
                </fieldset>

                <fieldset className="flex flex-col gap-3">
                  <legend className="text-sm font-medium">Lots du coffre</legend>
                  <p className="text-xs text-muted-foreground">Montant vide = lot non monétaire (ex. « Day off supplémentaire »).</p>
                  <ul className="flex flex-col gap-2">
                    {prizes.fields.map((f, i) => (
                      <li key={f.id} className="flex flex-col gap-1">
                        <div className="grid grid-cols-[1fr_5rem_6rem_3rem_auto] items-center gap-2">
                          <Input
                            aria-label={`Libellé du lot ${i + 1}`}
                            placeholder="5 €"
                            disabled={isSubmitting}
                            aria-invalid={!!errors.prizes?.[i]?.label}
                            {...register(`prizes.${i}.label`)}
                          />
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            aria-label={`Poids du lot ${i + 1}`}
                            disabled={isSubmitting}
                            aria-invalid={!!errors.prizes?.[i]?.weight}
                            {...register(`prizes.${i}.weight`)}
                          />
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="€"
                            aria-label={`Montant du lot ${i + 1} en euros`}
                            disabled={isSubmitting}
                            aria-invalid={!!errors.prizes?.[i]?.amountEur}
                            {...register(`prizes.${i}.amountEur`)}
                          />
                          <span className="text-right text-xs tabular-nums text-muted-foreground">{share(watchedPrizes[i]?.weight, prizeTotal)}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            aria-label={`Supprimer le lot ${i + 1}`}
                            disabled={isSubmitting}
                            onClick={() => prizes.remove(i)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                        <FieldError
                          message={errors.prizes?.[i]?.label?.message ?? errors.prizes?.[i]?.weight?.message ?? errors.prizes?.[i]?.amountEur?.message}
                        />
                      </li>
                    ))}
                  </ul>
                  {/* Idem : au moins un lot de poids > 0. */}
                  <FieldError message={errors.prizes?.message ?? errors.prizes?.root?.message} />
                  <Button type="button" variant="outline" size="sm" className="self-start" disabled={isSubmitting} onClick={() => prizes.append({ label: '', weight: '10', amountEur: '' })}>
                    <Plus className="size-4" /> Lot
                  </Button>
                </fieldset>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Aperçu</p>
                <WheelSvg sectors={preview} className="max-w-[14rem]" />
              </div>
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
                Enregistrer
              </ActionButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
