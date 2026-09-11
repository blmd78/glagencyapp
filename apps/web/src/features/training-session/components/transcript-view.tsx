import { MessageBubble } from '@/components/training/message-bubble'
import type { SessionThread } from '../types'

/**
 * Transcription intégrale d'une conversation TERMINÉE (aucun message caché : contrairement à
 * `message-list.tsx` en session active, pas de filtre `visibleAt`) — ouverte par défaut (solo,
 * écran raté), repliée explicitement sur les cartes défi/boss (`open={false}`). RSC, sans état.
 */
export function TranscriptView({ thread, open = true }: { thread: SessionThread; open?: boolean }) {
  const n = thread.messages.length
  return (
    <details className="rounded-xl border" open={open}>
      {/* « Transcription » ne disait pas qu'il y a quelque chose à ouvrir, et sur une carte
          défi/boss (repliée par défaut) le chatteur en concluait que sa conversation n'était
          pas consultable. Le libellé invite maintenant, et annonce ce qu'il y a derrière. */}
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium hover:underline">
        Voir la conversation
        {n > 0 && <span className="ml-1.5 font-normal opacity-70">({n} message{n > 1 ? 's' : ''})</span>}
      </summary>
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
