import { Badge } from '@/components/ui/badge'

/** Sous ce seuil (secondes), le chrono passe en rouge. */
const URGENT_S = 10

/**
 * Chrono restant d'une conversation — MÊME rendu dans l'en-tête du panneau (`thread-panel.tsx`) et
 * dans l'onglet (`thread-tabs.tsx`), qui l'écrivaient chacun à sa façon (badge vs texte rouge).
 */
export function ChronoBadge({ seconds }: { seconds: number }) {
  return (
    <Badge variant={seconds <= URGENT_S ? 'destructive' : 'secondary'} className="tabular-nums">
      ⏱ {seconds} s
    </Badge>
  )
}
