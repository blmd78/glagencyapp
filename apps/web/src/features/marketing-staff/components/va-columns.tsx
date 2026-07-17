'use client'

import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { Pencil, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sortable } from '@/components/data-table/sortable'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur } from '@/lib/format'
import { deleteStaff } from '../actions'
import type { MktStaffRow } from '../types'

/** Résumé lisible des assignations d'un VA (colonne du tableau). */
export function assignSummary(s: MktStaffRow): string {
  const parts: string[] = []
  if (s.linkIds.length) parts.push(`${s.linkIds.length} lien(s)`)
  if (s.igAccountIds.length) parts.push(`${s.igAccountIds.length} compte(s) IG`)
  if (s.twAccountIds.length) parts.push(`${s.twAccountIds.length} TW suivi(s)`)
  return parts.length ? parts.join(' · ') : 'Aucune assignation'
}

/**
 * Colonnes de la table VA. `onEdit` ouvre le dialog PARTAGÉ (état côté `VaView`, pas une
 * instance par ligne — préserve le DOM/comportement d'origine, cf.
 * docs/guidelines-standard-feature.md « split > 300 l. »).
 */
export function makeVaColumns({
  isAdmin,
  canWrite,
  onEdit,
}: {
  isAdmin: boolean
  canWrite: boolean
  onEdit: (s: MktStaffRow) => void
}): ColumnDef<MktStaffRow>[] {
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }) => <Sortable column={column} label="Membre" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {/* Badge teinté de la couleur de la fiche (même esprit que les badges modèle). */}
          <Badge
            className="border-transparent font-medium"
            style={{ backgroundColor: `${row.original.color}24`, color: row.original.color }}
          >
            {row.original.name}
          </Badge>
        </div>
      ),
    },
    {
      id: 'assign',
      header: 'Assignations',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{assignSummary(row.original)}</span>
      ),
    },
    {
      accessorKey: 'fixedEur',
      header: ({ column }) => <Sortable column={column} label="Fixe /mois" className="justify-end" />,
      cell: ({ getValue }) => <span className="tabular-nums">{eur(getValue() as number)}</span>,
      meta: { align: 'right' },
    },
    {
      accessorKey: 'rateTw',
      header: ({ column }) => <Sortable column={column} label="€ / sub" className="justify-end" />,
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">{eur(row.original.rateTw)}</span>
      ),
      meta: { align: 'right' },
    },
    {
      accessorKey: 'rateIg',
      header: ({ column }) => <Sortable column={column} label="€ / 1k vues" className="justify-end" />,
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">{eur(row.original.rateIg)}</span>
      ),
      meta: { align: 'right' },
    },
    {
      accessorKey: 'paymentMethod',
      header: 'Paiement',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Statut',
      cell: ({ getValue }) => (
        <Badge className={(getValue() as boolean) ? STATUS_COLORS.positive : STATUS_COLORS.neutral}>
          {(getValue() as boolean) ? 'Actif' : 'Inactif'}
        </Badge>
      ),
      meta: { align: 'center' },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-center gap-1">
          {/* Édition réservée à l'écriture (admin/manager) — masquée pour un chatteur. */}
          {canWrite && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => onEdit(row.original)}
              aria-label={`Modifier ${row.original.name}`}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
          {isAdmin && (
            <ConfirmDialog
              title={`Supprimer ${row.original.name} ?`}
              description="Sa fiche, ses assignations et son historique de paiements sont supprimés définitivement. Les liens et comptes suivis ne sont pas touchés — ils redeviennent simplement non assignés."
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-red-600 hover:text-red-700"
                  aria-label={`Supprimer ${row.original.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              }
              onConfirm={async () => {
                const res = await deleteStaff(row.original.id)
                if (!res.success) {
                  toast.error(res.error)
                  return res.error
                }
                toast.success(`${row.original.name} supprimé`)
              }}
            />
          )}
        </div>
      ),
      meta: { align: 'center' },
    },
  ]
}
