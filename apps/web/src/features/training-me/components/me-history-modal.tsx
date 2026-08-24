'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MeHistory } from './me-history'
import type { MeSession } from '../types'

/**
 * L'historique des sessions en MODALE. L'app d'origine n'en avait pas du tout sur l'accueil ; on le
 * garde (il est utile pour relire une notation) mais hors du flux, pour que l'accueil reste l'écran
 * unique de GLA — hero, objectif, deux colonnes, et rien d'autre.
 */
export function MeHistoryModal({ sessions }: { sessions: MeSession[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="gla-link mt-3 flex h-auto w-full items-center justify-center gap-1.5 p-[11px] text-[12.5px] font-bold hover:bg-transparent"
      >
        <span aria-hidden>🕘</span> Mon historique
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* `gla` : portail sur <body>, hors du conteneur de la page. */}
        <DialogContent className="gla max-h-[82vh] overflow-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              <span aria-hidden className="mr-1.5">🕘</span> Mon historique
            </DialogTitle>
          </DialogHeader>
          <MeHistory sessions={sessions} />
        </DialogContent>
      </Dialog>
    </>
  )
}
