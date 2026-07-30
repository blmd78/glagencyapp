import { Sparkles } from 'lucide-react'
import { daysSinceArrival, isStaleNew } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'
import { cn } from '@/lib/utils'

/**
 * Badge « nouvel arrivant » (0101) — jumeau de `ShiftBadge`/`RoleBadge`/`TeamBadge` : source unique
 * du rendu, `isNew` faux → ne rend rien (aucun appelant n'a de cas à gérer).
 *
 * DEUX VARIANTES, parce que les écrans n'ont pas la même place : `badge` sur Membres et le Tracker
 * (une ligne de tableau, de la place pour un mot), `icon` sur le board Organisation, le planning
 * Repos, le rapport Police et la Compta — des grilles denses où un badge texte de plus casserait la
 * lecture (demande Benoit : « juste une icône »).
 *
 * AMBRE AU-DELÀ DU SEUIL, jamais orange : l'orange est la couleur du rôle POLICE et du closing
 * `closer` dans le code couleur de l'app — deux oranges de sens différent sur une même ligne se
 * liraient mal. Les deux teintes viennent de `STATUS_COLORS` (source unique) : `info` tant que
 * c'est une information, `warning` quand ça devient une action à faire.
 *
 * Le seuil n'est PAS calculé ici : `isStaleNew` vit dans `@glagency/core`, testée, et sert AUSSI au
 * compteur « N à revoir » de la page Membres. Deux calculs, ce serait un drift assuré.
 */

/** Teintes de l'icône seule — miroir de `STATUS_COLORS.info`/`.warning`, qui ne portent que des
 *  couples fond+texte inutilisables sur un glyphe nu. */
const ICON_TONE = {
  info: 'text-blue-600 dark:text-blue-400',
  warning: 'text-amber-600 dark:text-amber-400',
} as const

/** '2026-07-30' → '30/07/2026'. Local au badge : la seule date qu'il affiche. */
const frDate = (iso: string) => iso.split('-').reverse().join('/')

export function NewBadge({
  isNew,
  arrivedAt,
  variant = 'badge',
}: {
  isNew: boolean
  arrivedAt: string | null
  variant?: 'badge' | 'icon'
}) {
  if (!isNew) return null
  const stale = isStaleNew(isNew, arrivedAt)
  const days = daysSinceArrival(arrivedAt)
  const title = stale
    ? `Nouveau depuis ${days} jours — pense à décocher`
    : arrivedAt
      ? `Nouveau — arrivé le ${frDate(arrivedAt)}`
      : 'Nouveau'

  // Le `title` est porté par un `<span>`, pas par l'icône : les composants lucide n'acceptent pas
  // cette prop (ils ne la transmettent pas au `<svg>`). Même patron que les puces du planning repos.
  if (variant === 'icon')
    return (
      <span title={title} role="img" aria-label={title} className="inline-flex shrink-0">
        <Sparkles
          aria-hidden="true"
          className={cn('size-3.5', stale ? ICON_TONE.warning : ICON_TONE.info)}
        />
      </span>
    )

  return (
    <Badge title={title} className={stale ? STATUS_COLORS.warning : STATUS_COLORS.info}>
      <Sparkles aria-hidden="true" />
      Nouveau
    </Badge>
  )
}
