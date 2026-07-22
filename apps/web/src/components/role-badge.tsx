import { Badge } from '@/components/ui/badge'
import type { CrmRole } from '@/lib/types/chatters'

/**
 * Badge de rôle closing (setter/closer). Source unique du rendu — Setter violet, Closer orange
 * (évite la duplication du markup + des classes : Chatteurs, Stat chatteur, Membres). `null`/
 * `undefined` (chatteur sans désignation) → ne rend rien ; l'appelant gère l'absence.
 */
export function RoleBadge({ role }: { role: CrmRole | null | undefined }) {
  if (!role) return null
  return (
    <Badge
      className={
        role === 'closer'
          ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
          : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
      }
    >
      {role === 'closer' ? 'Closer' : 'Setter'}
    </Badge>
  )
}
