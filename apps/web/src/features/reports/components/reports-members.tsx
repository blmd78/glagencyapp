'use client'

import { MembersAccordion } from '@/components/members-accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberPanel } from '@/hooks/use-member-panel'
import { loadReports } from '../actions'
import { ReportPanel } from './report-panel'
import type { Report, ReportEntry } from '../types'

/**
 * Branchement du Dashboard sur la pile de noms partagée (`components/members-accordion.tsx`).
 * Le repère de droite répond SANS déplier à la question du dashboard — « qui n'a rien écrit
 * aujourd'hui ? » — sinon il faudrait ouvrir dix panneaux pour la poser. La liste ne contient
 * que l'encadrement : les chatteurs sont écartés en amont (`getReportMembers`).
 *
 * Le contenu est chargé à l'ouverture ET rechargé après un enregistrement (`onSaved`). Sans
 * ça, `revalidatePath` ne repatche que l'arbre serveur — le panneau resterait sur l'instantané
 * d'avant l'écriture, et re-sauvegarder écraserait le texte qu'on vient d'écrire (audit
 * 2026-07-27).
 *
 * L'état, le jeton de course et l'erreur de transport vivent dans `useMemberPanel`.
 */
export function ReportsMembers({ entries, today }: { entries: ReportEntry[]; today: string }) {
  const { panel, open } = useMemberPanel<Report[]>(loadReports)

  return (
    <MembersAccordion
      items={entries}
      onOpen={(e) => open(e.id)}
      hint={(e) => (e.days.includes(today) ? 'Compte rendu du jour' : "Rien aujourd'hui")}
    >
      {(e) => {
        const p = panel?.id === e.id ? panel : null
        if (!p || p.loading)
          return (
            <div role="status" className="flex flex-col gap-3">
              <span className="sr-only">Chargement…</span>
              <Skeleton aria-hidden="true" className="h-9 w-40" />
              <Skeleton aria-hidden="true" className="h-28 w-full rounded-xl" />
            </div>
          )
        if (p.error)
          return (
            <p role="alert" className="text-sm text-destructive">
              {p.error}
            </p>
          )
        return (
          <ReportPanel
            reports={p.data ?? []}
            today={today}
            canWrite={e.canWrite}
            idSuffix={e.id}
            nested
            onSaved={() => open(e.id)}
          />
        )
      }}
    </MembersAccordion>
  )
}
