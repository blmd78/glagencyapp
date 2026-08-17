'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { CRM_SHIFTS, isHeureSup, type CrmShift } from '@/lib/types/chatters'
import { saveOrgCell, setOrgPlacementKind } from '../actions'
import { COLS, OrgLegend, SHIFTS } from './org-table-cells'
import { OrgTableRows } from './org-table-rows'
import { OrgTableDraftRow } from './org-table-draft-row'
import type { OrgChatter, OrgRow, OrganisationData } from '../types'


/**
 * Le board d'orga — lecture d'abord, édition au survol. Write-through (cf. actions.ts).
 *
 * `canWrite` = composer les CASES (admin ou encadrant porteur de la page) ;
 * `isAdmin`  = la STRUCTURE (colonnes Manager/Sous-manager/Modèle, ajout et suppression de
 *              ligne). Même découpage que le planning repos.
 */
export function OrgTable({
  data,
  isAdmin,
  canWrite,
}: {
  data: OrganisationData
  isAdmin: boolean
  canWrite: boolean
}) {
  const router = useRouter()
  // DEUX transitions, et c'est délibéré :
  //  • `pending` (STRUCTURE) estompe le tableau — ajouter/déplacer/supprimer une ligne n'a pas
  //    d'affichage optimiste, l'utilisateur a besoin de voir que ça travaille ;
  //  • `startCellTransition` (CASES) est SILENCIEUSE. Estomper à chaque case rendait l'écran
  //    inutilisable pour enchaîner : `revalidatePath` re-render le RSC DANS la transition, donc
  //    le flag restait vrai jusqu'au retour serveur — un voile gris + clics bloqués à chaque
  //    ajout (retour Benoit 2026-07-30). Le planning repos ne récupère même pas ce flag
  //    (`const [, startTransition]`), et c'est précisément pourquoi il paraît instantané :
  //    la case affiche déjà le bon état, il n'y a rien à faire patienter.
  const [pending, startTransition] = useTransition()
  const [, startCellTransition] = useTransition()
  const [overrides, setOverrides] = useState<Record<string, string[]>>({})
  const [draft, setDraft] = useState<{ manager: string; owner: string } | null>(null)
  // RECHERCHE d'un chatter (barre au-dessus du tableau) : quand elle est vide, tout est comme avant ;
  // sinon on ne garde que les lignes où la personne a une case, et dans ces cases sa seule pastille —
  // « un chatter et tous ses shifts » d'un coup d'œil. Filtre d'AFFICHAGE : ouvrir une case montre
  // toujours sa composition entière, et les gestes écrivent sur les vraies listes.
  const [query, setQuery] = useState('')
  const fold = (v: string) =>
    v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  const q = fold(query.trim())
  const nameById = new Map(data.chatterOptions.map((o) => [o.id, o.name]))
  const matches = (id: string) => !q || fold(nameById.get(id) ?? '').includes(q)
  // Le drapeau suit exactement le chemin du nom — dérivé des MÊMES options, pour qu'une case n'ait
  // rien à aller chercher ailleurs que dans ce que le service lui a déjà donné.
  const newById = new Map(
    data.chatterOptions.map((o) => [o.id, { isNew: o.isNew, arrivedAt: o.arrivedAt }]),
  )
  // Shift PRINCIPAL par personne (0110) — même provenance. Ne sert qu'au type PAR DÉFAUT d'un
  // placement posé de manière optimiste (heure sup si ≠ principal), la règle du serveur.
  const principalById = new Map(data.chatterOptions.map((o) => [o.id, o.principalShift]))
  // Marque heure sup par placement (0110) : override optimiste > serveur > défaut. Clé = case + id.
  const [kindOverrides, setKindOverrides] = useState<Record<string, boolean>>({})
  const hsOf = (creatorId: string, shift: CrmShift, id: string, server: OrgChatter[]) =>
    kindOverrides[`${creatorId}:${shift}:${id}`] ??
    server.find((c) => c.id === id)?.hs ??
    isHeureSup(principalById.get(id), shift)
  function toggleKind(creatorId: string, shift: CrmShift, id: string, server: OrgChatter[]) {
    const key = `${creatorId}:${shift}:${id}`
    const nextHs = !hsOf(creatorId, shift, id, server)
    const before = kindOverrides
    setKindOverrides((p) => ({ ...p, [key]: nextHs }))
    startCellTransition(async () => {
      const res = await setOrgPlacementKind({ creatorId, chatterId: id, shift, hs: nextHs })
      if (!res.success) {
        setKindOverrides(before)
        toast.error(res.error)
      }
    })
  }

  // LES OVERRIDES NE SONT JAMAIS VIDÉS EN MASSE — exactement comme le planning repos, et c'est
  // ce qui rend l'ajout « à la volée » fluide (retour Benoit 2026-07-30).
  //
  // Le piège : `revalidatePath` sur la route COURANTE fait renvoyer un RSC actualisé, donc
  // `data` change d'identité après chaque écriture. Une réinitialisation des overrides sur ce
  // changement rebascule l'affichage sur les props à chaque commit — c'est ce qui se voyait
  // comme un rechargement entre deux ajouts. Repos n'a jamais eu ce vidage : ses overrides
  // tiennent l'écran, le serveur converge dessous, et rien ne bouge à l'image.
  //
  // Ils sont donc posés au commit, révoqués UNIQUEMENT en cas d'échec (revert ciblé plus bas),
  // et disparaissent naturellement au démontage du composant (navigation, rechargement).

  // Composition d'une case : override si présent, sinon l'état serveur.
  const cellIds = (creatorId: string, shift: CrmShift, server: OrgChatter[]) =>
    overrides[`${creatorId}:${shift}`] ?? server.map((c) => c.id)

  /**
   * Total AFFICHÉ d'une ligne = les ASSIGNÉS au modèle, corrigés des gestes non encore renvoyés par
   * le serveur : + une personne posée qui n'était pas assignée (le serveur va l'assigner), − une
   * personne qui était placée côté serveur et n'a plus aucune case (son dernier placement retiré →
   * le serveur la désassigne). Poser quelqu'un DÉJÀ assigné (sans placement, 0110) n'ajoute rien.
   * Nécessaire depuis qu'un commit ne rafraîchit plus la page.
   */
  const displayedTotal = (r: OrgRow) => {
    const assigned = new Set(r.assignedIds)
    const serverPlaced = new Set(CRM_SHIFTS.flatMap((sh) => r.byShift[sh].map((c) => c.id)))
    const shownIds = new Set(CRM_SHIFTS.flatMap((sh) => cellIds(r.creatorId, sh, r.byShift[sh])))
    let delta = 0
    for (const id of shownIds) if (!assigned.has(id)) delta += 1
    for (const id of serverPlaced) if (!shownIds.has(id)) delta -= 1
    return r.total + delta
  }

  // Gestes de STRUCTURE (ajout/déplacement de ligne) : la ligne apparaît ou change de
  // section — `revalidatePath` seul ne repeignait pas l'écran, on force le rafraîchissement.
  const run = (fn: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn()
      if (!res.success) {
        toast.error(res.error ?? 'Erreur')
        return
      }
      router.refresh()
    })

  function commitCell(
    creatorId: string,
    shift: CrmShift,
    next: string[],
    previous: string[],
    modelName: string,
  ) {
    const addedIds = next.filter((id) => !previous.includes(id))
    // Affichage optimiste de LA CASE seule : depuis 0110 un placement n'en déplace aucun autre —
    // ni les autres colonnes de la ligne (plusieurs shifts sur le même modèle sont libres), ni les
    // autres modèles. Le serveur fait exactement ça (`save_org_cell` : ajout = ajout).
    const before = overrides
    setOverrides((p) => ({ ...p, [`${creatorId}:${shift}`]: next }))
    startCellTransition(async () => {
      const res = await saveOrgCell({ creatorId, shift, chatterIds: next, previousIds: previous })
      if (!res.success) {
        // Échec : on restaure l'état d'avant le geste. Le tableau est `pointer-events-none`
        // pendant l'écriture, donc aucun autre commit n'a pu s'intercaler entre-temps.
        setOverrides(before)
        toast.error(res.error)
        return
      }
      // On NOMME l'effet réel, parce qu'il déborde de la case : une case du board écrit
      // l'ASSIGNATION du chatteur au modèle — son périmètre d'accès — et son PLACEMENT sur ce
      // shift (0110). Le popover l'annonce avant, ce toast le confirme après.
      const added = addedIds.map((id) => nameById.get(id) ?? '?')
      const removed = previous.filter((id) => !next.includes(id)).map((id) => nameById.get(id) ?? '?')
      if (added.length)
        toast.success(`${added.join(', ')} → ${SHIFTS[shift].label} sur ${modelName}`, {
          description:
            'Placé sur ce shift, modèle assigné si besoin — ses autres cases ne bougent pas.',
        })
      if (removed.length)
        toast.success(
          `${removed.join(', ')} retiré${removed.length > 1 ? 's' : ''} de ${modelName} · ${SHIFTS[shift].label}`,
          {
            description:
              'Ce placement seulement — sans autre placement sur ce modèle, il n’y est plus assigné.',
          },
        )
      // AUCUN `router.refresh()` ICI — c'est ce qui permet d'enchaîner les assignations sans
      // que l'écran se recharge entre deux (comportement du planning repos, dont `commitCell`
      // ne rafraîchit pas non plus : il pose l'override et laisse l'action partir).
      // L'override tient l'affichage ; `revalidatePath` côté action a déjà invalidé le cache,
      // donc la prochaine navigation servira les vraies données.
      // Les gestes de STRUCTURE, eux, gardent leur refresh (cf. `run`) : une ligne qui apparaît
      // ou change de section ne peut pas être représentée par un override de case.
    })
  }


  // Lignes visibles : toutes sans recherche ; sinon celles où la personne cherchée a une case
  // (overrides compris — une pastille qu'on vient de poser compte).
  const visibleData = q
    ? {
        ...data,
        sections: data.sections
          .map((s) => ({
            ...s,
            rows: s.rows.filter((r) =>
              CRM_SHIFTS.some((sh) => cellIds(r.creatorId, sh, r.byShift[sh]).some(matches)),
            ),
          }))
          .filter((s) => s.rows.length > 0),
      }
    : data
  const noMatch = q !== '' && visibleData.sections.length === 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un chatter…"
          aria-label="Rechercher un chatter sur le board"
          className="h-8 w-64 text-sm"
        />
        <OrgLegend />
      </div>
    {/* Estompage réservé aux gestes de STRUCTURE (cf. les deux transitions plus haut) : composer
        une case n'allume plus ce voile, sinon l'écran devenait inutilisable pour enchaîner. */}
    <div
      className={cn(
        'overflow-x-auto rounded-xl border transition-opacity',
        pending && 'pointer-events-none opacity-50',
      )}
      aria-busy={pending}
    >
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            <th className="w-40 px-3 py-2.5">Manager</th>
            <th className="w-44 px-3 py-2.5">Sous-manager</th>
            <th className="w-40 px-3 py-2.5">Modèle</th>
            {CRM_SHIFTS.map((s) => (
              <th key={s} className={cn('px-3 py-2.5', SHIFTS[s].wash)}>
                {SHIFTS[s].label}
              </th>
            ))}
            <th className="w-16 px-3 py-2.5 text-right">Total</th>
            <th className="w-8 px-1 py-2.5" />
          </tr>
        </thead>
        <tbody>
          <OrgTableRows
            data={visibleData}
            isAdmin={isAdmin}
            canWrite={canWrite}
            pending={pending}
            run={run}
            cellIds={cellIds}
            commitCell={commitCell}
            displayedTotal={displayedTotal}
            nameById={nameById}
            newById={newById}
            hsOf={hsOf}
            toggleKind={toggleKind}
            chipFilter={q ? matches : undefined}
          />
          {noMatch && (
            <tr>
              <td colSpan={COLS} className="px-3 py-6 text-center text-sm text-muted-foreground">
                Aucun chatter « {query.trim()} » n’a de case sur le board.
              </td>
            </tr>
          )}
          {isAdmin && !q && (
            <OrgTableDraftRow
              data={data}
              draft={draft}
              setDraft={setDraft}
              pending={pending}
              run={run}
            />
          )}
        </tbody>
      </table>
    </div>
    </div>
  )
}
