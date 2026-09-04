import Link from 'next/link'
import type { Route } from 'next'
import { fmtDuration, frWeekdayDate } from '@glagency/core'
import { int } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'
import type { ChatterWithoutAccount, MemberWithoutShift, OrphanLabel } from '../types'

/**
 * Les trois populations que le relevé ne compte pas complètement, rangées par GESTE de
 * réparation — parce que c'est le geste, et non le symptôme, qu'on vient chercher ici.
 *
 * 1. **Sans créneau attendu** — EN PREMIER, parce que c'est le plus nombreux (87 membres
 *    actifs en production au 2026-09-04) et le plus vite réparé : une valeur à poser dans
 *    Membres. Sans elle, le relevé mesure leur activité mais ne la compare à rien — aucune de
 *    leurs lignes n'est jamais « attendue » (D7), donc leur retard n'a aucun référent.
 * 2. **Sans compte membre** : le CRM les connaît (fiche, modèles, CA). Depuis 0144 ils ont leur
 *    ligne et leur nom sur le relevé ; il leur manque une fiche d'activité et la possibilité
 *    d'être signalés, qui exigent toutes deux un `profiles`. → leur ouvrir un compte.
 * 3. **Inconnus du CRM** : ni fiche `chatters`, ni compte. Leur travail n'est rattaché à rien,
 *    ils s'affichent sous leur pseudo MyPuls, et un encadrant borné à ses modèles ne les voit
 *    pas du tout. → les créer. Le moins nombreux (12 en production) et le plus coûteux.
 */
export function OrphanBin({
  orphans,
  noAccount,
  noShift,
  from,
  to,
}: {
  orphans: OrphanLabel[]
  noAccount: ChatterWithoutAccount[]
  noShift: MemberWithoutShift[]
  from: string
  to: string
}) {
  return (
    <div className="flex flex-col gap-6">
      <MissingShift members={noShift} />

      <p className="text-sm text-muted-foreground">
        Ci-dessous, l’activité relevée du {frWeekdayDate(from)} au {frWeekdayDate(to)}, triée par
        messages : en tête, ceux dont le travail non rattaché pèse le plus lourd.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityList
          title="Sans compte membre"
          count={noAccount.length}
          hint="Le CRM les connaît : ils ont leur ligne et leur nom sur le relevé. Ce qui leur manque est une fiche d’activité et la possibilité d’être signalés — une sanction se pose sur un compte."
          empty="Tous les chatteurs mesurés ont un compte."
          tone="info"
          rows={noAccount.map((o) => ({
            key: o.chatterId,
            label: o.chatterLabel,
            sub: `#${o.mypulsUserId}`,
            days: o.days,
            activeMinutes: o.activeMinutes,
            messages: o.messages,
          }))}
        />

        <ActivityList
          title="Inconnus du CRM"
          count={orphans.length}
          hint="Ni fiche chatteur, ni compte. Leur travail n’est rattaché à personne, et un encadrant borné à ses modèles ne les voit pas. Le rapprochement automatique se fait sur le nom à chaque relevé — ceux qui restent sont à créer à la main."
          empty="Tout le monde est rattaché."
          tone="warning"
          rows={orphans.map((o) => ({
            key: o.mypulsUserId,
            label: o.chatterLabel,
            sub: `#${o.mypulsUserId}`,
            days: o.days,
            activeMinutes: o.activeMinutes,
            messages: o.messages,
          }))}
        />
      </div>
    </div>
  )
}

interface ActivityRow {
  key: string
  label: string
  sub: string
  days: number
  activeMinutes: number
  messages: number
}

/**
 * Une liste triée par MESSAGES, décroissant. C'est le tri utile : il met en tête ceux dont le
 * travail non compté pèse le plus lourd, donc ceux qu'il faut traiter d'abord.
 */
function ActivityList({
  title,
  count,
  hint,
  empty,
  tone,
  rows,
}: {
  title: string
  count: number
  hint: string
  empty: string
  tone: 'warning' | 'info'
  rows: ActivityRow[]
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {title}
        <Badge className={STATUS_COLORS[tone]}>{count}</Badge>
      </h3>
      <p className="text-sm text-muted-foreground">{hint}</p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-4 font-normal">Chatter</th>
                <th className="py-1 pr-4 text-right font-normal">Jours</th>
                <th className="py-1 pr-4 text-right font-normal">Temps actif</th>
                <th className="py-1 text-right font-normal">Messages</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="py-2 pr-4">
                    <span className="font-medium">{r.label}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{r.sub}</span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.days}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {fmtDuration(r.activeMinutes)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{int(r.messages)}</td>
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
      <h3 className="flex items-center gap-2 text-sm font-medium">
        Membres actifs sans créneau
        <Badge className={STATUS_COLORS.neutral}>{members.length}</Badge>
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
            {unlinked} ne sont rattachés à aucune fiche chatteur (en orange) : MyPuls ne pourra
            jamais les reconnaître, même une fois leur créneau posé.
          </>
        )}
      </p>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tous les membres actifs ont un créneau.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
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
