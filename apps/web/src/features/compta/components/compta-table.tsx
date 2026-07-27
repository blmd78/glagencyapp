'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { mondaysIn, type PayPeriod } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { DataTable } from '@/components/data-table/data-table'
import { makeComptaColumns } from './compta-columns'
import { ComptaPayslip } from './compta-payslip'
import type { ComptaRow } from '../types'

/**
 * La pile de noms devient une DATA TABLE (demande du propriétaire, 2026-07-27 : « je pense
 * que c'est mieux en datatable pour la lisibilité »). Écart ASSUMÉ avec la spec §7, qui
 * prescrivait `MembersAccordion` — celui-ci reste en place sur le Planning et le Dashboard,
 * il n'est pas touché.
 *
 * Le panneau déplié reste la fiche de paie EXISTANTE (`ComptaPayslip`, montée telle quelle
 * dans `renderSubRows`) : détail du calcul, saisies hebdo et bouton de paiement. Les RÉGLAGES
 * (mode, taux, setter, prime) en sont sortis le 2026-07-27 : ils sont derrière l'engrenage de
 * la colonne d'actions (`compta-columns.tsx` → `ComptaSettingsDialog`), donc atteignables sans
 * déplier la ligne. `canConfigure` ne descend plus qu'aux colonnes.
 *
 * Mode PAGINÉ et non long scroll virtualisé : `paginated={false}` force chaque ligne à une
 * hauteur fixe pour que l'estimation du virtualizer colle au rendu (`data-table.tsx`), ce
 * qu'une fiche de paie dépliée (plusieurs formulaires) ne respecte pas.
 */
export function ComptaTable({
  rows,
  period,
  periodElapsed,
  linkableChatters,
  canEnter,
  canPay,
  canConfigure,
}: {
  rows: ComptaRow[]
  period: PayPeriod
  periodElapsed: boolean
  /** Chatteurs MyPuls libres — vide pour un non-admin (`ComptaData.linkableChatters`). */
  linkableChatters: { id: string; name: string }[]
  canEnter: boolean
  canPay: boolean
  canConfigure: boolean
}) {
  // Filtre « à relier ». Les non-reliés ont un CA et un net à 0 € : quel que soit le tri, ils
  // se retrouvent dispersés sur toutes les pages (34 sur 105 en prod, 8 sur 96 mesurés sur
  // l'UAT le 2026-07-27) alors que ce sont EUX qui appellent une action. Le badge
  // « ⚠ non relié » sur la ligne ne suffit pas s'il faut paginer pour le trouver.
  // Filtrage sur `data` AVANT la table (le `toolbar` n'a pas accès à l'instance TanStack) —
  // même patron que le sélecteur de modèle de `chatters-table.tsx`.
  const [onlyUnlinked, setOnlyUnlinked] = useState(false)
  const unlinked = rows.filter((r) => r.chatterId == null).length
  const data = onlyUnlinked ? rows.filter((r) => r.chatterId == null) : rows

  const columns = makeComptaColumns({ canConfigure, linkableChatters })
  const mondays = mondaysIn(period)

  return (
    <DataTable
      data={data}
      columns={columns}
      filterColumnId="name"
      filterPlaceholder="Filtrer par chatter…"
      // Tri initial par NOM : c'est l'ordre que la page a déjà (`compta-sources.ts` ordonne
      // les membres par `display_name`), et il ne privilégie aucune ligne. Un tri par net
      // décroissant enterrerait en dernière page les non-reliés (net = 0), qui sont
      // justement ceux qui appellent une action ; le compteur du toolbar les remonte.
      initialSorting={[{ id: 'name', desc: false }]}
      pageSize={20}
      // Identité STABLE (cf. data-table.tsx) : sans elle TanStack keye par index et une ligne
      // dépliée pointerait vers un AUTRE membre après un tri ou un `revalidatePath`.
      getRowId={(r) => r.id}
      getRowCanExpand={() => true}
      renderSubRows={(row) => (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          {/* `whitespace-normal` : `TableCell` pose `whitespace-nowrap`, qui écraserait les
              formulaires et la ventilation par modèle de la fiche. */}
          <TableCell colSpan={columns.length} className="p-4 whitespace-normal sm:p-5">
            <ComptaPayslip
              row={row.original}
              period={period}
              mondays={mondays}
              canEnter={canEnter}
              canPay={canPay}
              periodElapsed={periodElapsed}
            />
          </TableCell>
        </TableRow>
      )}
      countLabel={(n) => `${n} chatter${n > 1 ? 's' : ''}`}
      toolbar={
        unlinked > 0 && (
          <Button
            type="button"
            variant={onlyUnlinked ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={onlyUnlinked}
            onClick={() => setOnlyUnlinked((v) => !v)}
            className="gap-1.5"
          >
            <AlertTriangle className="size-3.5 text-amber-500" />
            {unlinked} non relié{unlinked > 1 ? 's' : ''}
          </Button>
        )
      }
    />
  )
}
