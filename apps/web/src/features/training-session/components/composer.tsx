'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ActionButton } from '@/components/action-button'
import { FieldError } from '@/components/field-error'
import { Textarea } from '@/components/ui/textarea'
import { composerForm, type ComposerInput } from '../schema'
import { MediaPricePopover } from './media-price-popover'

/**
 * Zone d'envoi : un message texte (Entrée envoie, Maj+Entrée = retour ligne) OU un média
 * verrouillé — un média est un message À PART ENTIÈRE (choisir le prix l'envoie tout de suite,
 * le texte en cours n'est pas consommé), miroir de `sendMessage` qui ignore le corps saisi.
 */
export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (v: ComposerInput) => Promise<boolean> }) {
  'use no memo'
  const [sendingMedia, setSendingMedia] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ComposerInput>({
    resolver: zodResolver(composerForm),
    defaultValues: { body: '', mediaPrice: null },
  })
  const busy = disabled || isSubmitting || sendingMedia

  const submit = handleSubmit(async (v) => {
    if (await onSend(v)) reset({ body: '', mediaPrice: null })
  })
  const sendMedia = async (price: number) => {
    setSendingMedia(true)
    try {
      await onSend({ body: '', mediaPrice: price })
    } finally {
      setSendingMedia(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t p-3">
      <Textarea
        {...register('body')}
        rows={2}
        placeholder={disabled ? 'En attente…' : 'Ton message…'}
        disabled={busy}
        aria-invalid={!!errors.body}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void submit()
          }
        }}
      />
      <div className="flex items-center gap-2">
        <FieldError message={errors.body?.message} />
        <div className="ml-auto flex items-center gap-2">
          <MediaPricePopover disabled={busy} onPick={(p) => void sendMedia(p)} />
          <ActionButton type="submit" size="sm" pending={isSubmitting || sendingMedia} disabled={disabled}>
            Envoyer
          </ActionButton>
        </div>
      </div>
    </form>
  )
}
