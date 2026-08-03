import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
 * DEUX FILTRES, tous deux dans l'URL donc partageables (guidelines §6) : la PÉRIODE via le
 * sélecteur de dates du header (`?from=&to=`, comme tout le CRM) et le MEMBRE via `?membre=` — le
 * même `MemberSelect` que le Planning et le Dashboard, qui préserve `?vue=turnover`/`activite` en
 * écrivant. Les deux se combinent : « ce qu'a fait Mehdi en juillet ».
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activité de l’agence</CardTitle>
        <CardDescription>
          Du {fr(from)} au {fr(to)} — la période suit le sélecteur de dates en haut de page.
        </CardDescription>
        <div className="pt-2">
          <MemberSelect members={members} value={selectedMember} allowAll />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <EventsTimeline events={events} showMember={!selectedMember} />
        {/* AUCUNE TRONCATURE SILENCIEUSE : si le plafond est atteint, la liste ne montre pas tout
            et doit le dire — sinon « rien après le 12 » se lit comme « rien ne s'est passé ». */}
        {events.length >= limit && (
          <p className="text-xs text-muted-foreground">
            Seuls les {limit} changements les plus récents de cette période sont affichés —
            resserre les dates ou choisis un membre pour voir les plus anciens.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
