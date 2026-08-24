'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ModuleRankRow } from '../services/get-module-ranking'

/**
 * Le classement complet du module en modale — même patron que celui de « Ma formation »
 * (`MeRankModal`) : la page ne porte que le podium, le détail s'ouvre à la demande. Sans ça, un
 * tableau de quinze lignes pousserait les exercices sous la ligne de flottaison.
 */
export function ModuleRankModal({ rows, myProfileId }: { rows: ModuleRankRow[]; myProfileId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="gla-link mt-3 flex h-auto w-full items-center justify-center gap-1.5 p-[11px] text-[12.5px] font-bold hover:bg-transparent"
      >
        Voir le classement du module →
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* `gla` : portail sur <body>, hors du conteneur de la page. */}
        <DialogContent className="gla max-h-[82vh] overflow-auto sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              <span aria-hidden className="mr-1.5">🏆</span> Classement du module
            </DialogTitle>
          </DialogHeader>
          <ol className="flex flex-col gap-1">
            {rows.map((r, i) => (
              <li
                key={r.profileId}
                className={cn(
                  'flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[13px]',
                  r.profileId === myProfileId && 'bg-[var(--gla-p1-soft)] font-bold',
                )}
              >
                <span className="w-6 text-center tabular-nums text-[var(--gla-faint)]">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{r.displayName}</span>
                <span className="tabular-nums text-[var(--gla-muted)]">{r.casesDone} cas</span>
                <span className="w-12 text-right tabular-nums text-[var(--gla-muted)]">
                  {r.avgTotal == null ? '—' : Math.round(r.avgTotal)}
                </span>
                <span className="w-14 text-right font-bold tabular-nums text-[var(--gla-accent)]">
                  {r.points.toLocaleString('fr-FR')}
                </span>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  )
}
