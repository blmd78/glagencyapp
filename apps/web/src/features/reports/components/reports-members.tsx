'use client'

import { useRef, useState } from 'react'
import { MembersAccordion } from '@/components/members-accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { loadReports } from '../actions'
import { ReportPanel } from './report-panel'
import type { Report, ReportEntry } from '../types'

/** Panneau ouvert : une seule ligne à la fois, donc un seul état à porter. */
type Panel = { id: string; loading: boolean; reports?: Report[]; error?: string }

/**
 * Branchement du Dashboard sur la pile de noms partagée (`components/members-accordion.tsx`).
 * Le repère de droite répond SANS déplier à la question du dashboard — « qui n'a rien écrit
 * aujourd'hui ? » — sinon il faudrait ouvrir dix panneaux pour la poser. La liste ne contient
 * que l'encadrement : les chatteurs sont écartés en amont (`getReportMembers`).
 *
 * Le contenu des comptes rendus est chargé À L'OUVERTURE (`loadReports`) : le premier rendu ne
 * transporte que les jours d'écriture. Rechargé à chaque ouverture plutôt que mis en cache —
 * rouvrir une ligne est rare, et on veut la version fraîche. Pas de `useEffect` : l'ouverture
 * est un événement, `onOpen` le donne directement.
 *
 * ET rechargé APRÈS UN ENREGISTREMENT (`onSaved`). Sans ça, `revalidatePath` ne repatche que
 * l'arbre serveur — `panel.reports`, lui, resterait sur l'instantané d'avant l'écriture : un
 * aller-retour sur le sélecteur de jour remonterait le formulaire sur l'ancienne version, et
 * re-sauvegarder écraserait le texte qu'on vient d'écrire (audit 2026-07-27).
 */
export function ReportsMembers({ entries, today }: { entries: ReportEntry[]; today: string }) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const reqRef = useRef(0)

  const load = async (id: string) => {
    // Jeton par REQUÊTE, pas par personne : indexer la course sur le seul `id` laisserait la
    // réponse d'un premier appel écraser celle d'un second sur la MÊME personne (rouvrir vite,
    // ou recharger après enregistrement pendant qu'un chargement vole encore) — et la plus
    // ancienne pourrait gagner. Seule la dernière requête émise a le droit d'écrire.
    const token = ++reqRef.current
    setPanel({ id, loading: true })
    const settle = (next: Panel) => setPanel((p) => (token !== reqRef.current ? p : next))
    try {
      const res = await loadReports({ profileId: id })
      settle(
        res.success
          ? { id, loading: false, reports: res.data }
          : { id, loading: false, error: res.error },
      )
    } catch {
      // Échec de TRANSPORT (réseau coupé, 500 avant même d'entrer dans l'action) : `runAction`
      // n'a pas pu renvoyer d'`ActionResult`. Sans ce catch, la promesse rejette sans être
      // captée et le panneau reste en squelette à vie.
      settle({ id, loading: false, error: 'Chargement impossible — vérifie ta connexion.' })
    }
  }

  return (
    <MembersAccordion
      items={entries}
      onOpen={(e) => void load(e.id)}
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
            reports={p.reports ?? []}
            today={today}
            canWrite={e.canWrite}
            idSuffix={e.id}
            nested
            onSaved={() => void load(e.id)}
          />
        )
      }}
    </MembersAccordion>
  )
}
