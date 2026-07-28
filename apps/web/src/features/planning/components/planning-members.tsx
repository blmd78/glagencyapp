'use client'

import { useRef, useState } from 'react'
import { MembersAccordion } from '@/components/members-accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { loadPlanning } from '../actions'
import { PlanningView } from './planning-view'
import type { PlanningData, PlanningEntry } from '../types'

/** Panneau ouvert : une seule ligne à la fois, donc un seul état à porter. */
type Panel = { id: string; loading: boolean; data?: PlanningData; error?: string }

/**
 * Branchement du planning sur la pile de noms partagée (`components/members-accordion.tsx`) :
 * un repère « Aucun planning » lisible sans déplier, et l'emploi du temps dans le panneau.
 * `nested` : le nom est déjà porté par la ligne qui ouvre le panneau, l'en-tête ne le répète
 * pas et descend d'un niveau de titre.
 *
 * Les blocs sont chargés À L'OUVERTURE (`loadPlanning`) — le premier rendu ne transporte que
 * « qui a un planning », pas le contenu de chacun. Et rechargés APRÈS CHAQUE MUTATION
 * (`onChanged` → ajout, modification, suppression de bloc) : `revalidatePath` ne repatche que
 * l'arbre serveur, l'état client resterait sur l'instantané d'avant. C'est exactement le défaut
 * trouvé sur le Dashboard à l'audit du 2026-07-27, ici évité d'emblée.
 */
export function PlanningMembers({ entries }: { entries: PlanningEntry[] }) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const reqRef = useRef(0)

  const load = async (id: string) => {
    // Jeton par REQUÊTE : deux appels sur la MÊME personne (rouvrir vite, ou recharger après
    // mutation pendant qu'un chargement vole encore) ne doivent pas laisser gagner le plus
    // ancien. Seule la dernière requête émise a le droit d'écrire.
    const token = ++reqRef.current
    setPanel({ id, loading: true })
    const settle = (next: Panel) => setPanel((p) => (token !== reqRef.current ? p : next))
    try {
      const res = await loadPlanning({ profileId: id })
      settle(
        res.success
          ? { id, loading: false, data: res.data }
          : { id, loading: false, error: res.error },
      )
    } catch {
      // Échec de TRANSPORT : `runAction` n'a pas pu renvoyer d'`ActionResult`. Sans ce catch,
      // la promesse rejette sans être captée et le panneau reste en squelette à vie.
      settle({ id, loading: false, error: 'Chargement impossible — vérifie ta connexion.' })
    }
  }

  return (
    <MembersAccordion
      items={entries}
      onOpen={(e) => void load(e.id)}
      hint={(e) => (e.hasPlanning ? null : 'Aucun planning')}
    >
      {(e) => {
        const p = panel?.id === e.id ? panel : null
        if (!p || p.loading)
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
          <PlanningView
            data={p.data}
            canEdit={e.canEdit}
            nested
            onChanged={() => void load(e.id)}
          />
        )
      }}
    </MembersAccordion>
  )
}
