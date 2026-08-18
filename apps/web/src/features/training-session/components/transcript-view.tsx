import type { SessionThread } from '../types'
import { MessageBubble } from './message-bubble'

/**
 * Transcription intégrale d'une conversation TERMINÉE (aucun message caché : contrairement à
 * `message-list.tsx` en session active, pas de filtre `visibleAt`) — ouverte par défaut (solo,
 * écran raté), repliée explicitement sur les cartes défi/boss (`open={false}`). RSC, sans état.
 */
export function TranscriptView({ thread, open = true }: { thread: SessionThread; open?: boolean }) {
  return (
    <details className="rounded-xl border" open={open}>
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium">Transcription</summary>
      <ul className="flex flex-col gap-2 border-t p-4">
        {thread.messages.length === 0 && (
          <li className="py-4 text-center text-sm text-muted-foreground">La conversation n’a pas commencé.</li>
        )}
        {thread.messages.map((m) => (
          <li key={m.id} className={m.speaker === 'fan' ? 'self-start' : 'self-end'}>
            <MessageBubble message={m} />
          </li>
        ))}
      </ul>
    </details>
  )
}
