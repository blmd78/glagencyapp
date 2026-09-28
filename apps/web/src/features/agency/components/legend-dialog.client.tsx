'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Palette } from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { callAction } from '@/lib/actions-client'
import { saveLegend } from '../actions'
import { EVENT_COLORS, legendInput, type Legend, type LegendInput } from '../schema'
import { ColorDot } from './legend'

const fromLegend = (legend: Legend): LegendInput => ({
  items: EVENT_COLORS.map((color) => ({ color, label: legend[color] ?? '' })),
})

/**
 * Le nom de chaque couleur — ADMIN seul. Une ligne par teinte de la palette ; vide = la couleur
 * reste utilisable mais n'apparaît pas dans la légende.
 * `'use no memo'` : le React Compiler casse `formState` de RHF (cf. `compta-link-dialog.tsx`).
 */
export function LegendDialog({ legend }: { legend: Legend }) {
  'use no memo'
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LegendInput>({ resolver: zodResolver(legendInput), defaultValues: fromLegend(legend) })

  const submit = handleSubmit(async (values) => {
    const res = await callAction(saveLegend(values))
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Légende enregistrée')
    setOpen(false)
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) reset(fromLegend(legend))
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Palette className="size-4" />
          Légende
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Légende des couleurs</DialogTitle>
          <DialogDescription>Donne un nom aux couleurs que tu utilises. Laisse vide pour ne pas l’afficher.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            {EVENT_COLORS.map((color, i) => (
              <div key={color} className="grid gap-1">
                <div className="flex items-center gap-3">
                  <ColorDot color={color} className="size-4" />
                  <Input placeholder="Sans nom" maxLength={40} aria-label={`Nom de la couleur ${i + 1}`} {...register(`items.${i}.label`)} />
                </div>
                {errors.items?.[i]?.label && (
                  <p className="pl-7 text-xs text-red-600 dark:text-red-400">{errors.items[i]?.label?.message}</p>
                )}
              </div>
            ))}
          </div>
          {errors.root && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.root.message}
            </p>
          )}
          <DialogFooter>
            <ActionButton type="submit" pending={isSubmitting}>
              Enregistrer
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
