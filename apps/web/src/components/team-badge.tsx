import { Badge } from '@/components/ui/badge'
import type { CrmTeam } from '@/lib/types/chatters'

/**
 * Badge d'équipe closing (rouge/bleue). Source unique du rendu — évite la duplication
 * du markup + des classes de couleur (Chatteurs, Spenders, Stat chatteur). `null`/`undefined`
 * (chatteur non lié / sans désignation) → ne rend rien ; l'appelant gère le placeholder (« — »).
 */
export function TeamBadge({ team }: { team: CrmTeam | null | undefined }) {
  if (!team) return null
  return (
    <Badge
      className={
        team === 'rouge'
          ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
      }
    >
      {team === 'rouge' ? 'Rouge' : 'Bleue'}
    </Badge>
  )
}
