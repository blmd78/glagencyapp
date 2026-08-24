'use client'

import { useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { RankScope } from '../types'

const OPTIONS: { value: RankScope; label: string }[] = [
  { value: 'semaine', label: 'Cette semaine' },
  { value: 'semaine-derniere', label: 'Semaine dernière' },
  { value: 'global', label: 'Global' },
]

/**
 * Le classement complet en MODALE — comme dans l'app d'origine (`openRankModal`), où l'accueil ne
 * porte que le podium et un lien « Voir le classement complet → ». C'est ce qui permet de garder
 * l'accueil sur un seul écran, sans onglets.
 *
 * Le scope reste dans l'URL (`?classement=`) : le serveur ne charge qu'UNE RPC de classement par
 * requête, donc changer de période est une navigation, pas un filtre client.
 *
 * Les lignes arrivent en `children`, DÉJÀ RENDUES par le serveur — et pas en props de données. Ce
 * composant est client (état `open` + sélecteur), or tout ce qu'un composant client reçoit en props
 * est sérialisé en JSON dans le payload : passer le classement le ferait traverser deux fois, en
 * données puis en HTML. En `children`, seul le HTML voyage.
 */
export function MeRankModal({ scope, children }: { scope: RankScope; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const go = (next: string) => {
    // `ToggleGroup type="single"` renvoie '' au clic sur l'item déjà actif : rien à faire.
    if (!next) return
    const params = new URLSearchParams(searchParams)
    if (next === 'semaine') params.delete('classement')
    else params.set('classement', next)
    const qs = params.toString()
    router.replace((qs ? `/formation/ma-formation?${qs}` : '/formation/ma-formation') as Route, { scroll: false })
  }

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="gla-link mt-3 flex h-auto w-full items-center justify-center gap-1.5 p-[11px] text-[12.5px] font-bold hover:bg-transparent"
      >
        Voir le classement complet →
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* `gla` : le Dialog est rendu dans un portail sur <body>, hors du conteneur de la page. */}
        <DialogContent className="gla max-h-[82vh] overflow-auto sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              <span aria-hidden className="mr-1.5">🏆</span> Classement
            </DialogTitle>
          </DialogHeader>

          <ToggleGroup type="single" variant="outline" size="sm" value={scope} onValueChange={go} className="self-start">
            {OPTIONS.map((o) => (
              <ToggleGroupItem key={o.value} value={o.value}>
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {children}
        </DialogContent>
      </Dialog>
    </>
  )
}
