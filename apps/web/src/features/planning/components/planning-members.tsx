'use client'

import { MembersAccordion } from '@/components/members-accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberPanel } from '@/hooks/use-member-panel'
import { loadPlanning } from '../actions'
import { PlanningView } from './planning-view'
import type { PlanningData, PlanningEntry } from '../types'

/**
 * Branchement du planning sur la pile de noms partagée (`components/members-accordion.tsx`) :
 * un repère « Aucun planning » lisible sans déplier, et l'emploi du temps dans le panneau.
 * `nested` : le nom est déjà porté par la ligne qui ouvre le panneau, l'en-tête ne le répète
 * pas et descend d'un niveau de titre.
 *
 * Les blocs sont chargés À L'OUVERTURE — le premier rendu ne transporte que « qui a un
 * planning ». Et rechargés APRÈS CHAQUE MUTATION (`onChanged`) : `revalidatePath` ne repatche
 * que l'arbre serveur, le panneau vient d'une Server Action et resterait sur l'instantané
 * d'avant. C'est le défaut trouvé sur le Dashboard à l'audit du 2026-07-27.
 *
 * L'état, le jeton de course et l'erreur de transport vivent dans `useMemberPanel`.
 */
export function PlanningMembers({ entries }: { entries: PlanningEntry[] }) {
  const { panel, open } = useMemberPanel<PlanningData>(loadPlanning)

  return (
    <MembersAccordion
      items={entries}
      onOpen={(e) => open(e.id)}
      hint={(e) => (e.hasPlanning ? null : 'Aucun planning')}
    >
      {(e) => {
        const p = panel?.id === e.id ? panel : null
        if (!p || (p.loading && !p.data))
          return (
            <div role="status" className="flex flex-col gap-3">
              <span className="sr-only">Chargement…</span>
              <Skeleton aria-hidden="true" className="h-5 w-64" />
              <Skeleton aria-hidden="true" className="h-9 w-full max-w-lg" />
              <Skeleton aria-hidden="true" className="h-16 w-full rounded-xl" />
            </div>
          )
        if (p.error)
          return (
            <p role="alert" className="text-sm text-destructive">
              {p.error}
            </p>
          )
        if (!p.data) return null
        return (
          <PlanningView data={p.data} canEdit={e.canEdit} nested onChanged={() => open(e.id)} />
        )
      }}
    </MembersAccordion>
  )
}
