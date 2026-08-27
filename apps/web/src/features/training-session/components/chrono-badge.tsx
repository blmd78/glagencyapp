import { Badge } from '@/components/ui/badge'

/**
 * Sous ce seuil (secondes), le compteur passe en rouge. 15 s — le seuil de GLA pour le TEXTE
 * (`index.html:1610`, `t.classList.toggle('urg', s<=15)`), volontairement PLUS TÔT que celui de
 * l'anneau (10 s) : le chiffre alerte, l'anneau met la pression.
 */
const URGENT_S = 15

/** `⏱ M:SS` — format GLA (`index.html:1610`). 42 s → « ⏱ 0:42 ». */
function mmss(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Chrono restant d'une conversation — MÊME rendu dans l'en-tête du panneau (`thread-panel.tsx`) et
 * dans l'onglet (`thread-tabs.tsx`), qui l'écrivaient chacun à sa façon (badge vs texte rouge).
 *
 * Il DOUBLE l'anneau de `fan-ring.tsx` au lieu de le remplacer, comme GLA qui affichait les deux
 * (`#tring` + `#ttimer`) : l'anneau est `aria-hidden`, donc ce badge est le seul chrono accessible.
 */
export function ChronoBadge({ seconds }: { seconds: number }) {
  return (
    <Badge variant={seconds <= URGENT_S ? 'destructive' : 'secondary'} className="tabular-nums">
      ⏱ {mmss(seconds)}
    </Badge>
  )
}
