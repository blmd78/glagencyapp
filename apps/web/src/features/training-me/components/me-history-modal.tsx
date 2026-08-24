'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * L'historique des sessions en MODALE. L'app d'origine n'en avait pas sur l'accueil ; on le garde
 * (il sert à relire une notation) mais hors du flux, pour que l'accueil reste l'écran unique de
 * GLA — hero, objectif, deux colonnes, et rien d'autre.
 *
 * Le contenu arrive en `children`, DÉJÀ RENDU par le serveur — et pas en props de données. Ce
 * composant est client (il lui faut l'état `open`), or tout ce qu'un composant client reçoit en
 * props est sérialisé en JSON dans le payload : passer les 50 sessions les ferait traverser le
 * réseau deux fois, en données puis en HTML. En `children`, seul le HTML voyage.
 */
export function MeHistoryModal({ children }: { children: ReactNode }) {
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
        {/* `gla` : portail sur <body>, hors du conteneur de la page — il lui faut la palette. */}
        <DialogContent className="gla max-h-[82vh] overflow-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              <span aria-hidden className="mr-1.5">🕘</span> Mon historique
            </DialogTitle>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    </>
  )
}
