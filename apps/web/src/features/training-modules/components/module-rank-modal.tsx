'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RankList } from '@/components/training/rank-list'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
          <RankList rows={rows} myProfileId={myProfileId} />
        </DialogContent>
      </Dialog>
    </>
  )
}
