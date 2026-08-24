'use client'

import { useEffect, useRef } from 'react'
import { MessageBubble } from '@/components/training/message-bubble'
import type { SessionMessage } from '../types'

/**
 * Les messages RÉVÉLÉS d'une conversation (le filtre `visibleAt` est fait par `ThreadPanel`) :
 * fan à gauche, chatter à droite, média verrouillé en clair, bulle « … » quand la réponse du fan
 * est écrite mais pas encore révélée (défi/boss). Défile toujours en bas.
 */
export function MessageList({
  messages,
  pendingFan,
  fanName,
}: {
  messages: SessionMessage[]
  pendingFan: boolean
  fanName: string
}) {
  const ref = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, pendingFan])

  return (
    // Hauteur FIXE (GLA `.chat-big`), pas un max : la barre de saisie reste au même endroit du
    // premier au dernier message, au lieu de descendre à chaque échange.
    <ul ref={ref} className="flex h-[58vh] flex-col gap-2 overflow-y-auto py-1.5">
      {messages.length === 0 && !pendingFan && (
        <li className="py-6 text-center text-sm text-muted-foreground">La conversation n’a pas encore commencé.</li>
      )}
      {messages.map((m) => (
        <li key={m.id} className={m.speaker === 'fan' ? 'self-start' : 'self-end'}>
          <MessageBubble message={m} />
        </li>
      ))}
      {pendingFan && (
        <li className="self-start">
          <p className="animate-pulse rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{fanName} écrit…</p>
        </li>
      )}
    </ul>
  )
}
