import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'
import { cn } from '@/lib/utils'
import type { EventKind } from '@glagency/core'
import type { MemberEvent } from '../types'

/** Horodatage en fuseau Paris EXPLICITE : `at` est un timestamptz — sans `timeZone`, le SSR (UTC)
 *  et un navigateur parisien rendraient un jour différent (mismatch d'hydratation). Même patron
 *  que `members-columns.tsx`. */
const FR_DATETIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** Teinte par nature d'événement — reprend le code couleur de l'app : bleu pour ce qui touche au
 *  chatteur, violet pour les modèles, vert pour l'encadrement, ambre pour les alertes. */
const KIND_TONE: Record<EventKind, string> = {
  creation: STATUS_COLORS.info,
  role: STATUS_COLORS.positive,
  shift: STATUS_COLORS.info,
  closing: STATUS_COLORS.info,
  modele: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  manager: STATUS_COLORS.positive,
  pages: STATUS_COLORS.neutral,
  nouveau: STATUS_COLORS.info,
  arrivee: STATUS_COLORS.positive,
  sortie: STATUS_COLORS.warning,
  lien: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  identite: STATUS_COLORS.neutral,
}

const KIND_LABEL: Record<EventKind, string> = {
  creation: 'Création',
  role: 'Rôle',
  shift: 'Shift',
  closing: 'Closing',
  modele: 'Modèle',
  manager: 'Rattachement',
  pages: 'Droits',
  nouveau: 'Nouveau',
  arrivee: 'Arrivée',
  sortie: 'Départ',
  lien: 'Lien MyPuls',
  identite: 'Fiche',
}

/**
 * Timeline d'événements — sert la fiche d'un membre ET le flux global « Activité » : même donnée,
 * deux questions (« qu'est-il arrivé à Mehdi ? » / « qui a bougé quoi cette semaine ? »).
 * `showMember` bascule l'affichage du nom, seule différence entre les deux usages.
 *
 * SERVER COMPONENT depuis le retrait du filtre de droits : il ne reste aucun état à porter, donc
 * plus aucune raison de payer un composant client (les changements de droits sont désormais écartés
 * côté service — cf. `get-member-events.ts`).
 */
export function EventsTimeline({
  events,
  showMember = false,
}: {
  events: MemberEvent[]
  showMember?: boolean
}) {
  if (events.length === 0)
    return <p className="text-sm text-muted-foreground">Aucun changement sur cette période.</p>

  return (
    <ul className="flex flex-col">
      {events.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2 last:border-0"
        >
          <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
            {FR_DATETIME.format(new Date(e.at))}
          </span>
          <Badge className={cn('shrink-0 text-xs font-normal', KIND_TONE[e.kind])}>
            {KIND_LABEL[e.kind]}
          </Badge>
          {showMember && <span className="text-sm font-medium">{e.memberName}</span>}
          <span className="text-sm">{e.label}</span>
          {/* « système » et pas « inconnu » : l'écriture vient d'un script ou de SQL direct,
              ce n'est pas une information manquante mais une provenance différente. */}
          <span className="ml-auto text-xs text-muted-foreground">{e.actorName ?? 'système'}</span>
        </li>
      ))}
    </ul>
  )
}
