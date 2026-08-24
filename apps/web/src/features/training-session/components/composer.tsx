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
export function Composer({ disabled, allowMedia, onSend }: { disabled: boolean; allowMedia: boolean; onSend: (v: ComposerInput) => Promise<boolean> }) {
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
    // Barre de saisie sur UNE ligne (GLA) : le média à gauche, le champ qui s'étire, l'envoi à
    // droite. La disposition en bloc renvoyait le bouton sous le champ et mangeait de la hauteur de
    // conversation à chaque rendu.
    <form onSubmit={submit} className="mt-3.5 flex flex-col gap-2">
      <div className="flex items-end gap-2">
        {/* GLA n'autorise le média payant que sur un cas de VENTE : ailleurs, le prompt du fan n'a
            pas la section MÉDIAS PAYANTS et il répondrait à côté. */}
        {allowMedia && <MediaPricePopover disabled={busy} onPick={(p) => void sendMedia(p)} />}
        <Textarea
          {...register('body')}
          rows={1}
          className="gla-creply flex-1"
          placeholder={disabled ? 'En attente…' : 'Écris ta réponse… (Entrée pour envoyer, Maj+Entrée pour un retour à la ligne)'}
          disabled={busy}
          aria-invalid={!!errors.body}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <ActionButton
          type="submit"
          pending={isSubmitting || sendingMedia}
          disabled={disabled}
          className="gla-btn h-12 flex-none border-0 px-5"
          aria-label="Envoyer"
        >
          ➤
        </ActionButton>
      </div>
      <FieldError message={errors.body?.message} />
    </form>
  )
}
