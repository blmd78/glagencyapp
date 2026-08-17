'use client'

import { useTransition } from 'react'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import { cn } from '@/lib/utils'
import { duplicateCase, moveCase, toggleCase } from '../actions'
import type { CatalogCase, CatalogModule } from '../types'

/**
 * Cas du module sélectionné, triés par `position` (défaut du seed : ordre GLA ≈ difficulté).
 * Actions par ligne : Éditer (dialog, Task 9), Dupliquer (copie inactive en fin de module),
 * Activer/Désactiver, ↑↓. Un solo joué dans un défi refuse la désactivation (message de l'action).
 */
export function CasesTable({ module, onEdit }: { module: CatalogModule; onEdit?: (c: CatalogCase) => void }) {
  const [pending, startTransition] = useTransition()
  const sectionTitle = new Map(module.sections.map((s) => [s.id, s.title]))
  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok?: string) =>
    startTransition(async () => {
      const res = await fn()
      if (!res.success) toast.error(res.error ?? 'Erreur')
      else if (ok) toast.success(ok)
    })

  if (module.cases.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun cas dans ce module.</p>
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Sorte</TableHead>
            <TableHead className="w-12 text-center">Diff.</TableHead>
            <TableHead>Titre</TableHead>
            <TableHead>Phase</TableHead>
            <TableHead>Section</TableHead>
            <TableHead className="w-14 text-center">Vente</TableHead>
            <TableHead className="w-16 text-center">Tours</TableHead>
            <TableHead className="w-44 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {module.cases.map((c, i) => (
            <TableRow key={c.id} className={cn(!c.active && 'text-muted-foreground')}>
              <TableCell className="tabular-nums">{i + 1}</TableCell>
              <TableCell>
                <Badge variant={c.kind === 'solo' ? 'outline' : 'secondary'}>{CASE_KIND_LABELS[c.kind]}</Badge>
              </TableCell>
              <TableCell className="text-center tabular-nums">{c.difficulty}</TableCell>
              <TableCell className={cn('font-medium', !c.active && 'line-through')}>
                {c.title}
                {!c.active && <span className="ml-2 text-xs font-normal">(inactif)</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">{c.phase || '—'}</TableCell>
              <TableCell className="text-muted-foreground">{c.sectionId ? (sectionTitle.get(c.sectionId) ?? '—') : '—'}</TableCell>
              <TableCell className="text-center">{c.isSale ? '✓' : ''}</TableCell>
              <TableCell className="text-center tabular-nums">{c.maxTurns}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-0.5">
                  {onEdit && (
                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Éditer ${c.title}`} onClick={() => onEdit(c)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Dupliquer ${c.title}`} disabled={pending}
                    onClick={() => run(() => duplicateCase({ id: c.id }), 'Cas dupliqué (inactif, en fin de module)')}>
                    <Copy className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={c.active ? `Désactiver ${c.title}` : `Activer ${c.title}`} disabled={pending}
                    onClick={() => run(() => toggleCase({ id: c.id, active: !c.active }))}>
                    {c.active ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Monter" disabled={pending || i === 0}
                    onClick={() => run(() => moveCase({ id: c.id, direction: 'up' }))}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Descendre" disabled={pending || i === module.cases.length - 1}
                    onClick={() => run(() => moveCase({ id: c.id, direction: 'down' }))}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
