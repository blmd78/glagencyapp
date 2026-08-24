'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RankList } from '@/components/training/rank-list'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { MeData, RankScope } from '../types'

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
 */
export function MeRankModal({ data, myProfileId }: { data: MeData; myProfileId: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { rankingScope, ranking, weeklyRanking } = data
  // Les deux RPC ne rendent pas les mêmes colonnes : on ne garde que le socle commun, seul
  // affiché ici (`RankList`).
  const rows = (rankingScope === 'global' ? ranking : (weeklyRanking ?? [])).map((r) => ({
    profileId: r.profileId,
    displayName: r.displayName,
    points: r.points,
    casesDone: r.casesDone,
    avgTotal: r.avgTotal,
  }))

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

          <ToggleGroup type="single" variant="outline" size="sm" value={rankingScope} onValueChange={go} className="self-start">
            {OPTIONS.map((o) => (
              <ToggleGroupItem key={o.value} value={o.value}>
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <RankList rows={rows} myProfileId={myProfileId} />
        </DialogContent>
      </Dialog>
    </>
  )
}
