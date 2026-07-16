'use client'

import { type Row } from '@tanstack/react-table'
import { TableCell, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import { eur, pct } from '@/lib/format'
import type { ChatterRow } from '@/lib/types/chatters'

/** Détail déplié : une ligne par modèle où le chatteur a produit + reliquat non ventilé. */
export function chatterSubRows(row: Row<ChatterRow>) {
  return (
    <>
      {row.original.models.map((m) => (
        <TableRow key={`${row.id}:${m.creatorId}`} className="bg-muted/30 hover:bg-muted/30">
          <TableCell className="pl-8">
            <Badge className={modelColor(m.model)}>{m.model}</Badge>
          </TableCell>
          <TableCell className="text-muted-foreground">—</TableCell>
          <TableCell />
          <TableCell className="text-right tabular-nums">{eur(m.ca)}</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">
            {m.com === null ? '—' : eur(m.com)}
          </TableCell>
          <TableCell className="text-right tabular-nums">{eur(m.ppv)}</TableCell>
          <TableCell className="text-right tabular-nums">{eur(m.tips)}</TableCell>
          {/* « Proposé » n'existe pas au grain chatteur × modèle (non ventilé par MyPuls) :
              on n'affiche que le vendu, et rien en conv (donnée inexistante à ce niveau). */}
          <TableCell className="text-right tabular-nums">
            {m.propose > 0 ? `${m.propose} / ${m.vendu}` : m.vendu}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {m.propose > 0 ? pct(m.tauxConv) : ''}
          </TableCell>
          <TableCell className="text-right text-muted-foreground">—</TableCell>
          <TableCell className="text-right text-muted-foreground">—</TableCell>
          <TableCell className="text-center text-muted-foreground">—</TableCell>
          <TableCell />
        </TableRow>
      ))}
      {row.original.caUnattributed > 0 && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell className="pl-8 italic text-amber-600">
            Non ventilé (identité à résoudre)
          </TableCell>
          <TableCell className="text-muted-foreground">—</TableCell>
          <TableCell />
          <TableCell className="text-right italic tabular-nums text-amber-600">
            {eur(row.original.caUnattributed)}
          </TableCell>
          <TableCell colSpan={9} className="text-muted-foreground">—</TableCell>
        </TableRow>
      )}
    </>
  )
}
