'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
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
  const rows =
    rankingScope === 'global'
      ? ranking.map((r) => ({ ...r, streakDays: r.streakDays, bossDone: r.bossDone }))
      : (weeklyRanking ?? []).map((r) => ({ ...r, streakDays: null, bossDone: null }))

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

          {rows.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-[var(--gla-muted)]">Personne n’a encore de résultat.</p>
          ) : (
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
                  <span className="min-w-0 flex-1 truncate">
                    {r.displayName}
                    {r.profileId === myProfileId && (
                      <span className="ml-1.5 text-[11px] font-normal text-[var(--gla-muted)]">toi</span>
                    )}
                  </span>
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
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
