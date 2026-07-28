'use client'

import { CountDot } from '@/components/count-dot'
import { MembersAccordion } from '@/components/members-accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberPanel } from '@/hooks/use-member-panel'
import { loadTodos } from '../actions'
import { TodosView } from './todos-view'
import type { Todo, TodoEntry } from '../types'

/**
 * Branchement de la to-do sur la pile de noms partagée (`components/members-accordion.tsx`),
 * comme le Planning et le Dashboard. Le repère répond SANS déplier à « qui a de la charge » :
 * point ambre + « N à traiter », même langage visuel que les en-têtes de modèle d'Insights
 * (`CountDot`, `components/count-dot.tsx`). À 0 — liste vide comme liste entièrement
 * terminée — pas de repère du tout, comme Insights masque son compteur : l'absence du point
 * EST l'information.
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
      hint={(e) =>
        // `inline-flex` (pas `flex`) : le wrapper hint de l'accordéon est un span inline,
        // pas un item flex comme chez Insights — même rendu, sans casser son alignement.
        e.openCount > 0 ? (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <CountDot tone="a-traiter" />
            {e.openCount} à traiter
          </span>
        ) : null
      }
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
