import Link from 'next/link'
import type { Route } from 'next'
import { fmtDuration, frWeekdayDate } from '@glagency/core'
import { int } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'
import type { MemberWithoutShift, OrphanLabel } from '../types'

/**
 * Le bac d'orphelins : les deux populations qui manquent au relevé, et qui manquent pour deux
 * raisons opposées.
 *
 * À GAUCHE, ceux que MyPuls mesure et que le CRM ne sait pas nommer. Leur travail est compté
 * chez MyPuls, jamais chez nous : le relevé les affiche sous leur pseudo, sans lien vers une
 * fiche, et un encadrant borné à ses modèles ne les voit pas du tout — une ligne sans profil
 * n'est montrée qu'aux non-bornés.
 *
 * À DROITE, ceux que le CRM connaît mais qui n'ont pas de créneau attendu. Le relevé mesure
 * bien leur activité, mais ne peut la comparer à rien : ils n'apparaissent ni dans les
 * manquants, ni dans le filtre « seulement leur créneau », et leur retard n'est calculé contre
 * aucune borne.
 */
export function OrphanBin({
  orphans,
  noShift,
  from,
  to,
}: {
  orphans: OrphanLabel[]
  noShift: MemberWithoutShift[]
  from: string
  to: string
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <UnmatchedLabels orphans={orphans} from={from} to={to} />
      <MissingShift members={noShift} />
    </div>
  )
}

function UnmatchedLabels({
  orphans,
  from,
  to,
}: {
  orphans: OrphanLabel[]
  from: string
  to: string
}) {
  const linkable = orphans.filter((o) => o.hasChatter).length

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">
        Mesurés par MyPuls, inconnus du CRM{' '}
        <span className="text-muted-foreground">({orphans.length})</span>
      </h3>
      <p className="text-sm text-muted-foreground">
        Du {frWeekdayDate(from)} au {frWeekdayDate(to)}. Le rapprochement se fait sur le nom : il
        se pose tout seul quand un seul chatteur du CRM porte ce libellé.{' '}
        {linkable > 0 && (
          <>
            {linkable} d’entre eux ont déjà une fiche <code>chatters</code> — il n’y manque que
            le rattachement à un membre.
          </>
        )}
      </p>

      {orphans.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tout le monde est rattaché.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-4 font-normal">Libellé MyPuls</th>
                <th className="py-1 pr-4 text-right font-normal">Jours</th>
                <th className="py-1 pr-4 text-right font-normal">Temps actif</th>
                <th className="py-1 text-right font-normal">Messages</th>
              </tr>
            </thead>
            <tbody>
              {orphans.map((o) => (
                <tr key={o.mypulsUserId} className="border-t">
                  <td className="py-2 pr-4">
                    <span className="font-medium">{o.chatterLabel}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      #{o.mypulsUserId}
                    </span>
                    {!o.hasChatter && (
                      <Badge className={`ml-2 ${STATUS_COLORS.warning}`}>à créer</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{o.days}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {fmtDuration(o.activeMinutes)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{int(o.messages)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function MissingShift({ members }: { members: MemberWithoutShift[] }) {
  const unlinked = members.filter((m) => !m.linked).length

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">
        Membres actifs sans créneau <span className="text-muted-foreground">({members.length})</span>
      </h3>
      <p className="text-sm text-muted-foreground">
        Le créneau attendu se pose dans{' '}
        <Link href={'/chatter/members' as Route} className="underline">
          Membres
        </Link>
        . Sans lui, le relevé mesure leur activité mais ne la compare à rien.
        {unlinked > 0 && (
          <>
            {' '}
            {unlinked} ne sont rattachés à aucune fiche <code>chatters</code> (en orange) : MyPuls
            ne pourra jamais les reconnaître, même une fois leur créneau posé.
          </>
        )}
      </p>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tous les membres actifs ont un créneau.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <Link key={m.profileId} href={`/chatter/presence/${m.profileId}` as Route}>
                <Badge
                  className={`${m.linked ? STATUS_COLORS.neutral : STATUS_COLORS.warning} hover:underline`}
                >
                  {m.memberName}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
