'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { WheelSector } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { FieldError } from '@/components/field-error'
import { WheelSvg } from '@/components/training/wheel-svg'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveModuleWheelConfig } from '../actions'
import { moduleWheelConfigForm, type ModuleWheelConfigFormValues, type ModuleWheelConfigInput } from '../schema'
import type { ModuleWheelConfig } from '../types'

/** Un poids saisi (l'input rend une chaîne) → nombre affichable. */
const asWeight = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}
/** Part d'un poids dans la roue, en %, arrondie — purement indicatif. */
const share = (w: unknown, total: number) => (total > 0 ? `${Math.round((asWeight(w) / total) * 100)} %` : '—')

const toForm = (c: ModuleWheelConfig): ModuleWheelConfigFormValues => ({
  title: c.title,
  segments: c.segments.map((s) => ({ label: s.label, weight: String(s.weight), amountEur: String(s.amountEur ?? 0) })),
})

/**
 * Configuration de la roue des modules (admin). UNE seule liste, contrairement à la roue nº 1 :
 * cette roue n'a qu'un étage — le secteur EST le montant, et il n'y a pas de perdant. Les poids
 * sont relatifs (la colonne « % » calcule la vraie probabilité), et l'aperçu à droite est la
 * VRAIE roue, redessinée à chaque frappe.
 *
 * Reset à chaque OUVERTURE seulement (piège des dialogs) : réinitialiser sur un changement de
 * `config` effacerait la saisie en cours si un autre admin enregistrait pendant ce temps.
 */
export function ModuleWheelConfigDialog({ config }: { config: ModuleWheelConfig }) {
  // OBLIGATOIRE sur tout composant RHF de ce projet : sans lui, le React Compiler casse
  // `formState` — le formulaire perd son état de chargement ET ses messages d'erreur.
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
  } = useForm<ModuleWheelConfigFormValues, unknown, ModuleWheelConfigInput>({
    resolver: zodResolver(moduleWheelConfigForm),
    defaultValues: toForm(config),
  })
  const prevOpen = useRef(false)
  useEffect(() => {
    if (open && !prevOpen.current) reset(toForm(config))
    prevOpen.current = open
  }, [open, config, reset])

  const segments = useFieldArray({ control, name: 'segments' })
  const watched = useWatch({ control, name: 'segments' }) ?? []
  const total = watched.reduce((n, x) => n + asWeight(x.weight), 0)
  // Espérance affichée : c'est le VRAI coût par tour, la seule chose qu'un admin doit regarder
  // avant d'enregistrer. Σ(poids × montant) / Σ(poids).
  const esperance =
    total > 0 ? watched.reduce((n, x) => n + asWeight(x.weight) * (Number(x.amountEur) || 0), 0) / total : 0
  // Aperçu : aucun secteur perdant sur cette roue.
  const preview: WheelSector[] = watched.map((x) => ({ label: String(x.label ?? ''), weight: asWeight(x.weight), lose: false }))

  const submit = handleSubmit(async (values) => {
    const res = await saveModuleWheelConfig(values)
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Configurer la roue des modules</DialogTitle>
            <DialogDescription>
              Un secteur = un montant, et tous sont gagnants. Les poids sont relatifs — le pourcentage est calculé.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="mw-title">Titre de la page</Label>
              <Input id="mw-title" disabled={isSubmitting} aria-invalid={!!errors.title} {...register('title')} />
              <FieldError message={errors.title?.message} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
              <fieldset className="flex flex-col gap-3">
                <legend className="text-sm font-medium">Secteurs</legend>
                <ul className="flex flex-col gap-2">
                  {segments.fields.map((f, i) => (
                    <li key={f.id} className="flex flex-col gap-1">
                      <div className="grid grid-cols-[1fr_6rem_5rem_3rem_auto] items-center gap-2">
                        <Input
                          aria-label={`Libellé du secteur ${i + 1}`}
                          placeholder="7 €"
                          disabled={isSubmitting}
                          aria-invalid={!!errors.segments?.[i]?.label}
                          {...register(`segments.${i}.label`)}
                        />
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="€"
                          aria-label={`Montant du secteur ${i + 1} en euros`}
                          disabled={isSubmitting}
                          aria-invalid={!!errors.segments?.[i]?.amountEur}
                          {...register(`segments.${i}.amountEur`)}
                        />
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          aria-label={`Poids du secteur ${i + 1}`}
                          disabled={isSubmitting}
                          aria-invalid={!!errors.segments?.[i]?.weight}
                          {...register(`segments.${i}.weight`)}
                        />
                        <span className="text-right text-xs tabular-nums text-muted-foreground">{share(watched[i]?.weight, total)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          aria-label={`Supprimer le secteur ${i + 1}`}
                          disabled={isSubmitting}
                          onClick={() => segments.remove(i)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <FieldError
                        message={
                          errors.segments?.[i]?.label?.message ??
                          errors.segments?.[i]?.amountEur?.message ??
                          errors.segments?.[i]?.weight?.message
                        }
                      />
                    </li>
                  ))}
                </ul>
                {/* Erreur de refine (au moins un poids > 0) : SOUS la liste — c'est la liste
                    entière qui est en cause, pas une ligne. */}
                <FieldError message={errors.segments?.message ?? errors.segments?.root?.message} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={isSubmitting}
                  onClick={() => segments.append({ label: '7 €', weight: '1', amountEur: '7' })}
                >
                  <Plus className="size-4" /> Secteur
                </Button>
              </fieldset>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Aperçu</p>
                <WheelSvg sectors={preview} className="max-w-[14rem]" />
                <p className="text-sm text-muted-foreground">
                  Coût moyen d’un tour :{' '}
                  <span className="font-medium tabular-nums text-foreground">{esperance.toFixed(2)} €</span>
                </p>
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
