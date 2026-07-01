'use client'

import { Fragment, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ChatterRow } from '../types'

const eur = (n: number) =>
  `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
const pct = (n: number) =>
  `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

export function ChattersTable({ chatters }: { chatters: ChatterRow[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Chatteur</TableHead>
            <TableHead>Équipe</TableHead>
            <TableHead className="text-right">CA</TableHead>
            <TableHead className="text-right">Com.</TableHead>
            <TableHead className="text-right">PPV</TableHead>
            <TableHead className="text-right">Tips</TableHead>
            <TableHead className="text-right">Prop./Vendu</TableHead>
            <TableHead className="text-right">Conv.</TableHead>
            <TableHead className="text-right">Présence</TableHead>
            <TableHead className="text-right">Réact.</TableHead>
            <TableHead className="text-center">Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {chatters.map((c) => {
            const hasDetail = c.nbModels > 0 || c.caUnattributed > 0
            const isOpen = open.has(c.id)
            return (
              <Fragment key={c.id}>
                <TableRow
                  className={cn(hasDetail && 'cursor-pointer')}
                  onClick={() => hasDetail && toggle(c.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ChevronRight
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground transition-transform',
                          isOpen && 'rotate-90',
                          !hasDetail && 'opacity-0',
                        )}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.name}</div>
                        {c.nbModels > 1 && (
                          <div className="text-xs text-muted-foreground">
                            {c.nbModels} modèles
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.team ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {eur(c.ca)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {eur(c.com)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{eur(c.ppv)}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(c.tips)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.propose} / {c.vendu}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(c.tauxConv)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {Math.round(c.presenceActiveH)}h / {Math.round(c.presenceIdleH)}h
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.reactiviteS != null ? `${c.reactiviteS}s` : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={c.active ? 'secondary' : 'outline'}>
                      {c.active ? 'Actif' : 'Fantôme'}
                    </Badge>
                  </TableCell>
                </TableRow>

                {isOpen &&
                  c.models.map((m) => (
                    <TableRow
                      key={`${c.id}:${m.model}`}
                      className="bg-muted/30 hover:bg-muted/30"
                    >
                      <TableCell className="pl-8 text-muted-foreground">
                        {m.model}
                      </TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(m.ca)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(m.ppv)}</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(m.tips)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.propose} / {m.vendu}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(m.tauxConv)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                    </TableRow>
                  ))}

                {isOpen && c.caUnattributed > 0 && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell className="pl-8 italic text-amber-600">
                      Non ventilé (identité à résoudre)
                    </TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-right italic tabular-nums text-amber-600">
                      {eur(c.caUnattributed)}
                    </TableCell>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      —
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
