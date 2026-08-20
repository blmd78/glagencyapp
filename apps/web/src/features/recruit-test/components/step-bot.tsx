'use client'

import { useEffect, useRef, useState } from 'react'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ChatMessage } from './flow-state'

/** Prix par défaut du média verrouillé (valeur GLA du panneau 📸). */
const DEFAULT_PRICE = 10

/**
 * Conversation avec le client IA — l'épreuve centrale. Reprise fidèle du chat GLA : en-tête au
 * nom du persona, compteur « échange x / N », bulles client à gauche / candidat à droite, et le
 * bouton 📸 qui envoie un MÉDIA VERROUILLÉ à un prix — un message à part entière, exactement
 * comme sur une vraie plateforme (c'est cette forme que la notation sait lire).
 *
 * Différence assumée vs GLA : c'est le CANDIDAT qui ouvre la conversation (la transcription est
 * tenue côté serveur, et `sendToBot` exige un message du candidat pour répondre).
 */
export function StepBot({
  persona,
  botMessages,
  chat,
  sending,
  onSend,
  onFinish,
}: {
  persona: string
  botMessages: number
  chat: ChatMessage[]
  sending: boolean
  onSend: (input: { body?: string; mediaPrice?: number }) => Promise<void>
  onFinish: () => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [mediaOpen, setMediaOpen] = useState(false)
  const [price, setPrice] = useState(String(DEFAULT_PRICE))
  const bottom = useRef<HTMLDivElement>(null)

  const sent = chat.filter((m) => m.speaker === 'candidat').length
  const over = sent >= botMessages
  // Bornes de `sendToBotInput` : un prix entier entre 1 et 10 000 €.
  const priceValue = Number(price)
  const priceOk = Number.isInteger(priceValue) && priceValue >= 1 && priceValue <= 10_000

  useEffect(() => {
    // `nearest` : on descend le fil de discussion, sans faire sauter la page entière.
    bottom.current?.scrollIntoView({ block: 'nearest' })
  }, [chat.length, sending])

  async function send() {
    const text = body.trim()
    if (!text || sending || over) return
    setBody('')
    await onSend({ body: text })
  }

  async function sendMedia() {
    if (!priceOk || sending || over) return
    setMediaOpen(false)
    await onSend({ mediaPrice: priceValue })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 border-b pb-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-semibold" aria-hidden>
          {persona.slice(0, 1)}
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{persona} · client</p>
          <p className="text-xs text-muted-foreground">
            échange {Math.min(sent + (over ? 0 : 1), botMessages)} / {botMessages}
          </p>
        </div>
      </div>

      <div className="flex h-[22rem] flex-col gap-2 overflow-y-auto pr-1">
        {chat.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Le client arrive… c’est à toi d’engager la conversation. Tu joues la créatrice.
          </p>
        )}
        {chat.map((message, i) => (
          <p
            key={i}
            className={cn(
              'max-w-[46ch] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
              message.speaker === 'client' ? 'bg-muted' : 'self-end bg-primary text-primary-foreground',
            )}
          >
            {message.mediaPrice != null ? `🔒 Média verrouillé — ${message.mediaPrice} €` : message.body}
          </p>
        ))}
        {sending && <p className="text-xs text-muted-foreground">en train d’écrire…</p>}
        <div ref={bottom} />
      </div>

      {over ? (
        <ActionButton className="w-full" pending={sending} onClick={() => void onFinish()}>
          Terminer
        </ActionButton>
      ) : (
        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={sending}
              aria-label="Envoyer un média verrouillé"
              onClick={() => setMediaOpen((o) => !o)}
            >
              📸
            </Button>
            <Textarea
              rows={2}
              value={body}
              disabled={sending}
              placeholder="Écris ta réponse…"
              className="min-h-0 flex-1"
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <ActionButton pending={sending} disabled={body.trim().length === 0} onClick={() => void send()}>
              Envoyer
            </ActionButton>
          </div>

          {mediaOpen && (
            <div className="flex items-center gap-2 rounded-md border p-2">
              <span className="text-sm">📸 Média verrouillé au prix de</span>
              <Input
                type="number"
                min={1}
                step={1}
                value={price}
                className="w-20"
                aria-label="Prix du média en euros"
                onChange={(e) => setPrice(e.target.value)}
              />
              <span className="text-sm">€</span>
              <ActionButton size="sm" className="ml-auto" pending={sending} disabled={!priceOk} onClick={() => void sendMedia()}>
                Envoyer
              </ActionButton>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Le bouton 📸 envoie un média payant à débloquer, comme sur une vraie plateforme.
          </p>
        </div>
      )}
    </div>
  )
}
