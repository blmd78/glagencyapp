import type { MessageSpeaker } from '@/lib/types/training'
import { cn } from '@/lib/utils'

/**
 * Une bulle de message, SANS état (RSC-compatible) — fan à gauche / chatter à droite, média
 * verrouillé en clair. L'ALIGNEMENT est au parent (`self-start` / `self-end` sur l'élément de
 * liste) : la bulle ne fait que son fond et sa largeur max.
 *
 * Partagée : la session d'entraînement (`training-session`, liste live + transcription) et le chat
 * du test de recrutement (`recruit-test`) rendaient la même bulle chacune de leur côté. La forme
 * du message est décrite STRUCTURELLEMENT (pas de type de feature : `components/` ne peut pas
 * importer `features/`), ce qui laisse chaque appelant passer le sien.
 */
export function MessageBubble({ message }: { message: { speaker: MessageSpeaker; body: string; mediaPrice?: number | null } }) {
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
