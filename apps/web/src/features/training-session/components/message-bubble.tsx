import { cn } from '@/lib/utils'
import type { SessionMessage } from '../types'

/**
 * Une bulle de message, SANS état (RSC-compatible) — fan à gauche / chatter à droite, média
 * verrouillé en clair. Factorisée hors de `message-list.tsx` (session active, client) pour être
 * réutilisée par `transcript-view.tsx` (résultat, RSC) sans tirer de hook.
 */
export function MessageBubble({ message }: { message: SessionMessage }) {
  return (
    <p
      className={cn(
        'max-w-[46ch] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
        message.speaker === 'fan' ? 'bg-muted' : 'bg-primary text-primary-foreground',
      )}
    >
      {message.mediaPrice != null ? `🔒 Média verrouillé — ${message.mediaPrice} €` : message.body}
    </p>
  )
}
