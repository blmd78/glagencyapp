'use client'

import { useState } from 'react'
import { MEDIA_PRICE_LADDER } from '@/lib/types/training'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { mediaPriceForm } from '../schema'

// Les paliers vivent dans `lib/types/training` : ce sont EXACTEMENT ceux que le prompt du fan du
// boss lui apprend à gravir. Proposer d'autres prix pousserait le chatter vers `[[ELIM:saut]]`.
// La saisie libre reste possible — c'était le seul mode de GLA.

/**
 * « Média 🔒 » : choisir un prix ENVOIE le média — c'est un message à part entière (le texte en
 * cours de saisie n'est pas touché). Popover porté (`PopoverContent` est en portail) : pas de
 * `<form>` imbriqué dans le composer côté DOM, mais l'évènement `submit` remonterait quand même
 * l'arbre React → `stopPropagation`.
 */
export function MediaPricePopover({ disabled, onPick }: { disabled: boolean; onPick: (price: number) => void }) {
  'use no memo'
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof mediaPriceForm>, unknown, z.output<typeof mediaPriceForm>>({
    resolver: zodResolver(mediaPriceForm),
    defaultValues: { price: '' },
  })

  const pick = (price: number) => {
    setOpen(false)
    reset({ price: '' })
    onPick(price)
  }
  const submit = handleSubmit((v) => pick(v.price))

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset({ price: '' })
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          Média 🔒
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          onSubmit={(e) => {
            e.stopPropagation()
            void submit(e)
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm font-medium">Envoyer un média verrouillé</p>
          <div className="flex flex-wrap gap-2">
            {MEDIA_PRICE_LADDER.map((p) => (
              <Button key={p} type="button" variant="secondary" size="sm" onClick={() => pick(p)}>
                {p} €
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input type="number" min={1} step={1} placeholder="Prix" aria-label="Prix du média en euros" aria-invalid={!!errors.price} {...register('price')} />
            <Button type="submit" size="sm">
              Envoyer
            </Button>
          </div>
          <FieldError message={errors.price?.message} />
        </form>
      </PopoverContent>
    </Popover>
  )
}
