import { MEDAL_BRONZE, medalFor, type Medal } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MEDAL_LABELS } from '@/lib/types/training'

/**
 * Couleur par palier — feu tricolore (recette shadcn des badges custom : fond 50 / texte 700 en
 * light, fond 950 / texte 300 en dark, cf. `lib/status-color.ts`) : bon (Or, Argent) = vert,
 * juste validé (Bronze) = orange, sous 60 = rouge. Le libellé distingue Or d'Argent, pas la couleur.
 */
const MEDAL_COLORS: Record<Medal | 'none', string> = {
  or: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  argent: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  bronze: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  none: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

/**
 * Une note /100 en badge coloré par palier : « Or 92/100 » / « Argent 78/100 » / « Bronze 64/100 »,
 * et juste « 47/100 » en rouge sous 60 (le palier se lit à la couleur, plus de « — à valider » —
 * demande du 2026-08-19 ; le seuil reste en `title`). `null` → rien. UNIQUE rendu d'une note dans l'app
 * (Ma formation, Modules, résultat de session, historique, Overview) — d'où `components/`, pas
 * une feature.
 */
export function ScoreBadge({ total, className }: { total: number | null | undefined; className?: string }) {
  if (total == null) return null
  const medal = medalFor(total)
  return (
    <Badge
      className={cn('tabular-nums', MEDAL_COLORS[medal ?? 'none'], className)}
      title={medal ? `Médaille ${MEDAL_LABELS[medal]}` : `Sous ${MEDAL_BRONZE} — cas non validé`}
    >
      {medal ? `${MEDAL_LABELS[medal]} ${total}/100` : `${total}/100`}
    </Badge>
  )
}
