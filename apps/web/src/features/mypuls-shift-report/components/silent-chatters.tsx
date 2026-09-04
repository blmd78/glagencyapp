import Link from 'next/link'
import type { Route } from 'next'
import { SLOT_LABEL } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'
import type { SilentChatter, SlotFilter } from '../types'

/**
 * Les chatteurs attendus sur ce créneau qui n'ont envoyé AUCUN message.
 *
 * Le libellé dit « aucune activité », jamais « absent », et le ton reste neutre : le CRM n'a
 * aucune source de jours travaillés (`tracker_settings` est vide en production). Écrire
 * « absent » ferait de chaque jour de repos un signalement — le faux positif le plus cher de
 * ce chantier, puisqu'il finirait en retenue sur une paie.
 */
export function SilentChatters({
  chatters,
  slot,
}: {
  chatters: SilentChatter[]
  slot: SlotFilter
}) {
  if (chatters.length === 0) return null

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-medium">
        Aucune activité {slot === 'all' ? 'de la journée' : `sur le créneau ${SLOT_LABEL[slot]}`}{' '}
        <span className="text-muted-foreground">({chatters.length})</span>
      </h2>
      <p className="text-sm text-muted-foreground">
        Attendus d’après leur shift, sans un seul message. Jour de repos, congé ou absence : le
        relevé ne permet pas de trancher.
      </p>
      <div className="flex flex-wrap gap-2">
        {chatters.map((c) => (
          <Link key={c.profileId} href={`/chatter/presence/${c.profileId}` as Route}>
            <Badge className={`${STATUS_COLORS.neutral} hover:underline`}>{c.memberName}</Badge>
          </Link>
        ))}
      </div>
    </section>
  )
}
