'use client'

import { useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { mondaysIn, type PayPeriod } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { DataTable } from '@/components/data-table/data-table'
import { makeComptaColumns } from './compta-columns'
import { ComptaPayslip } from './compta-payslip'
import type { ComptaRow } from '../types'

/**
 * Vues de la table — filtre de statut EXCLUSIF. Exclusif et pas combinable, et c'est un
 * choix : « à payer », « payés » et « non reliés » PARTITIONNENT la table (un non-relié n'a
 * pas de net calculable, il n'est donc ni à payer ni payé) — croiser « payés » ET « non
 * reliés » ne produirait que des ensembles vides. Un seul sélecteur de vue est aussi ce qui
 * se lit le plus vite dans le toolbar. Re-cliquer le filtre actif revient à « Tous ».
 */
type StatusFilter = 'all' | 'to-pay' | 'paid' | 'unlinked'

/** Bouton-filtre du toolbar — même forme que l'ancien bouton « N non reliés » (Button
 *  outline/secondary), l'état actif est annoncé via `aria-pressed`. */
function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'outline'}
      size="sm"
      aria-pressed={active}
      onClick={onClick}
      className="gap-1.5"
    >
      {children}
    </Button>
  )
}

/**
 * La pile de noms devient une DATA TABLE (demande du propriétaire, 2026-07-27 : « je pense
 * que c'est mieux en datatable pour la lisibilité »). Écart ASSUMÉ avec la spec §7, qui
 * prescrivait `MembersAccordion` — celui-ci reste en place sur le Planning et le Dashboard,
 * il n'est pas touché.
 *
 * Le panneau déplié reste la fiche de paie EXISTANTE (`ComptaPayslip`, montée telle quelle
 * dans `renderSubRows`) : détail du calcul, saisies hebdo et bouton de paiement. Les RÉGLAGES
 * (taux, fixe, prime) ont quitté la Compta le 2026-07-28 : ils vivent dans l'onglet « Compta »
 * du dialog de Membres — la colonne « Rémunération » y renvoie. `canConfigure` ne descend plus
 * aux colonnes que pour le bouton « Relier » de la colonne « Statut ».
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
  // Filtres de statut (demande du propriétaire, 2026-07-28 : « rajouter un filtre payé et
  // reste à payer ») — Tous / À payer / Payés, plus le filtre « non reliés » historique :
  // les non-reliés ont un CA et un net à 0 € et se dispersent sur toutes les pages (34 sur
  // 105 en prod) alors que ce sont EUX qui appellent une action.
  // Filtrage sur `data` AVANT la table (le `toolbar` n'a pas accès à l'instance TanStack) —
  // même patron que le sélecteur de modèle de `chatters-table.tsx`. La recherche par nom
  // (filtre TanStack) s'applique PAR-DESSUS : les deux composent.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const unlinked = rows.filter((r) => r.chatterId == null).length
  const paidCount = rows.filter((r) => r.chatterId != null && r.paid).length
  const toPayCount = rows.length - unlinked - paidCount
  // Si le dernier non-relié vient d'être relié (revalidation serveur), son bouton disparaît :
  // sans ce repli la table resterait bloquée sur une vue vide qu'aucun bouton ne désactive.
  const filter = statusFilter === 'unlinked' && unlinked === 0 ? 'all' : statusFilter
  const data =
    filter === 'unlinked'
      ? rows.filter((r) => r.chatterId == null)
      : filter === 'paid'
        ? rows.filter((r) => r.chatterId != null && r.paid)
        : filter === 'to-pay'
          ? rows.filter((r) => r.chatterId != null && !r.paid)
          : rows
  // Re-cliquer le filtre actif revient à « Tous ».
  const toggle = (f: StatusFilter) => setStatusFilter((cur) => (cur === f ? 'all' : f))

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
        <>
          <FilterButton active={filter === 'all'} onClick={() => setStatusFilter('all')}>
            Tous
          </FilterButton>
          <FilterButton active={filter === 'to-pay'} onClick={() => toggle('to-pay')}>
            À payer ({toPayCount})
          </FilterButton>
          <FilterButton active={filter === 'paid'} onClick={() => toggle('paid')}>
            Payés ({paidCount})
          </FilterButton>
          {unlinked > 0 && (
            <FilterButton active={filter === 'unlinked'} onClick={() => toggle('unlinked')}>
              <AlertTriangle className="size-3.5 text-amber-500" />
              {unlinked} non relié{unlinked > 1 ? 's' : ''}
            </FilterButton>
          )}
        </>
      }
    />
  )
}
