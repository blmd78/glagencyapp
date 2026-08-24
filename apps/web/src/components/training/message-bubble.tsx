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
 *
 * Sous le thème GLA (`.gla`), les couleurs sont celles de l'app d'origine (`.msg.them` / `.msg.me`)
 * : fan en surface sombre, chatteur en clair sur fond blanc cassé — l'inverse de la convention
 * shadcn, mais c'est ce que les chatteurs connaissent. Hors `.gla` (test de recrutement), la bulle
 * garde les tokens du CRM.
 */
export function MessageBubble({ message }: { message: { speaker: MessageSpeaker; body: string; mediaPrice?: number | null } }) {
  return (
    <p
      className={cn(
        'max-w-[46ch] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
        message.speaker === 'fan'
          ? 'rounded-bl-[5px] bg-muted [.gla_&]:border [.gla_&]:border-[var(--gla-border)] [.gla_&]:bg-[var(--gla-surface)]'
          : 'rounded-br-[5px] bg-primary text-primary-foreground [.gla_&]:bg-[#eef1f7] [.gla_&]:font-medium [.gla_&]:text-[#10131a]',
      )}
    >
      {message.mediaPrice != null ? `🔒 Média verrouillé — ${message.mediaPrice} €` : message.body}
    </p>
  )
}
