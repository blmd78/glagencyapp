'use client'

// Détail déplié de l'historique Police : une sous-ligne par sanction du chatteur. Le crayon
// (écrivains) rouvre LE dialog de saisie pré-rempli (`SanctionDialog` — demande Benoit
// 2026-08-17, remplace l'ancien popover montant+note), la corbeille supprime. Fichier séparé
// de `police-columns.tsx` / `police-table.tsx` (guidelines §1, fichiers < 300 lignes).

import { type Row } from '@tanstack/react-table'
import { frDayShort, frTimeShort } from '@glagency/core'
import { toast } from 'sonner'
import { Trash2, TriangleAlert, Gavel, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur2max as eur } from '@/lib/format'
import { deletePoliceEntry } from '../actions'
import type { PoliceData, PoliceEntry } from '../types'
import type { ChatterGroup } from './police-columns'
import { SanctionDialog } from './sanction-dialog'

/** Sous-lignes : badge, erreur, motif, shift, puis date · contrôleur (+ actions à droite dans
 *  la MÊME cellule — pas de colonne fantôme à maintenir en miroir dans les colonnes d'agrégat). */
export function policeSubRows(row: Row<ChatterGroup>, canWrite: boolean, data: PoliceData) {
  return row.original.entries.map((e) => {
    const isMalus = e.kind === 'malus'
    return (
      <TableRow key={e.id} className="bg-muted/30 hover:bg-muted/30">
        <TableCell className="pl-8">
          <Badge className={STATUS_COLORS[isMalus ? 'danger' : 'warning']}>
            {isMalus ? <Gavel className="size-3" /> : <TriangleAlert className="size-3" />}
            {isMalus ? eur(e.amountEur) : 'Avert.'}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">{e.errorLabel ?? '—'}</TableCell>
        <TableCell>
          <span className="block max-w-40 truncate text-muted-foreground" title={e.note ?? undefined}>
            {e.note ?? '—'}
          </span>
        </TableCell>
        <TableCell className="capitalize text-muted-foreground">{e.shift ?? '—'}</TableCell>
        <TableCell>
          <div className="flex items-center justify-between gap-2">
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {frDayShort(e.occurredOn)} · {frTimeShort(e.createdAt)} · {e.controllerName}
            </span>
            {canWrite && <RowActions e={e} data={data} />}
          </div>
        </TableCell>
      </TableRow>
    )
  })
}

/** Bout de sous-ligne (écrivains) : édition (dialog complet pré-rempli) + suppression — mêmes
 *  règles d'écriture que la pose (0106). */
function RowActions({ e, data }: { e: PoliceEntry; data: PoliceData }) {
  const isMalus = e.kind === 'malus'
  // Échec → l'erreur reste DANS le ConfirmDialog (retour string) — plus de toast doublon
  // (l'audit a relevé le même message affiché deux fois). Succès → toast.
  const remove = async () => {
    const res = await deletePoliceEntry({ id: e.id })
    if (!res.success) return res.error
    toast.success('Entrée supprimée')
  }
  return (
    <div className="flex items-center justify-end">
      <SanctionDialog
        data={data}
        entry={e}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Modifier la sanction"
            className="size-7 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <ConfirmDialog
        onConfirm={remove}
        title="Supprimer cette entrée ?"
        description={`Supprimer définitivement ${isMalus ? 'ce malus' : 'cet avertissement'} de ${e.chatterName} ? Cette action est irréversible.`}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Supprimer"
            className="size-7 text-red-600 hover:text-red-700"
          >
            <Trash2 className="size-3.5" />
          </Button>
        }
      />
    </div>
  )
}
