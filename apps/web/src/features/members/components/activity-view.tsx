import { MemberSelect } from '@/components/member-select'
import type { SelectableMember } from '@/lib/types/member'
import type { MemberEvent } from '../types'
import { EventsTimeline } from './events-timeline'

/** '2026-07-30' → '30/07/2026'. */
const fr = (iso: string) => iso.split('-').reverse().join('/')

/**
 * Onglet « Activité » (0104) — le MÊME historique que la fiche membre, lu par l'autre bout :
 * la fiche répond à « qu'est-il arrivé à Mehdi ? », ce flux à « qui a bougé quoi cette semaine ? ».
 *
 * MISE EN PAGE CALQUÉE SUR L'ONGLET COMPTES (demande Benoit 2026-08-03), au rythme exact de la
 * `DataTable` : sous-titre de contexte, puis une barre de contrôles (`flex flex-wrap items-center
 * gap-2`), puis le contenu, puis le compte en bas. Pas de `Card` — l'onglet voisin n'en a pas, et
 * deux onglets d'une même page qui se présentent différemment se lisent comme deux pages.
 *
 * DEUX FILTRES, tous deux dans l'URL donc partageables (guidelines §6) : la PÉRIODE via le
 * sélecteur de dates du header (`?from=&to=`, comme tout le CRM) et le MEMBRE via `?membre=` — le
 * même `MemberSelect` que le Planning et le Dashboard, qui préserve `?vue=` en écrivant.
 *
 * Server Component : le sélecteur (feuille cliente) porte à lui seul l'interactivité.
 */
export function ActivityView({
  events,
  members,
  selectedMember,
  from,
  to,
  limit,
}: {
  events: MemberEvent[]
  /** Tous les profils, PARTIS COMPRIS — leur historique est justement celui qu'on vient relire. */
  members: SelectableMember[]
  /** `?membre=` validé côté serveur (appartenance à `members`), ou null = tout le monde. */
  selectedMember: string | null
  from: string
  to: string
  /** Plafond de la lecture — sert à dire quand la liste est tronquée. */
  limit: number
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Du {fr(from)} au {fr(to)} — la période suit le sélecteur de dates en haut de page.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MemberSelect members={members} value={selectedMember} allowAll />
        </div>

        <EventsTimeline events={events} showMember={!selectedMember} />

        <div className="text-sm text-muted-foreground">
          {events.length} changement{events.length > 1 ? 's' : ''}
          {/* AUCUNE TRONCATURE SILENCIEUSE : au plafond, la liste ne montre pas tout et doit le
              dire — sinon « rien après le 12 » se lit comme « rien ne s'est passé ». */}
          {events.length >= limit &&
            ` — plafond atteint, resserre les dates ou choisis un membre pour voir les plus anciens`}
        </div>
      </div>
    </div>
  )
}
