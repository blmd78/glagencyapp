'use client'

import { MembersAccordion } from '@/components/members-accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberPanel } from '@/hooks/use-member-panel'
import { loadTodos } from '../actions'
import { TodosView } from './todos-view'
import type { Todo, TodoEntry } from '../types'

/**
 * Branchement de la to-do sur la pile de noms partagée (`components/members-accordion.tsx`),
 * comme le Planning et le Dashboard. Le repère répond SANS déplier à « qui a de la charge » ;
 * « Rien » couvre autant la liste vide que la liste entièrement terminée.
 *
 * « à traiter » et non « en cours » : « En cours » est déjà le libellé du statut
 * `in_progress` et une section de la liste — le même mot ne doit pas désigner deux ensembles.
 *
 * Les tâches partent à l'ouverture (`loadTodos`) et sont rechargées après chaque mutation
 * (`onChanged`) : le panneau vient d'une Server Action, `revalidatePath` ne le rafraîchit pas.
 */
export function TodosMembers({ entries }: { entries: TodoEntry[] }) {
  const { panel, open } = useMemberPanel<Todo[]>(loadTodos)

  return (
    <MembersAccordion
      items={entries}
      onOpen={(e) => open(e.id)}
      hint={(e) => (e.openCount > 0 ? `${e.openCount} à traiter` : 'Rien')}
    >
      {(e) => {
        const p = panel?.id === e.id ? panel : null
        if (!p || (p.loading && !p.data))
          return (
            <div role="status" className="flex flex-col gap-3">
              <span className="sr-only">Chargement…</span>
              <Skeleton aria-hidden="true" className="h-9 w-40" />
              <Skeleton aria-hidden="true" className="h-24 w-full rounded-xl" />
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
          <TodosView
            todos={p.data}
            profileId={e.id}
            targetHasAccess={e.hasPlanningPage}
            onChanged={() => open(e.id)}
          />
        )
      }}
    </MembersAccordion>
  )
}
