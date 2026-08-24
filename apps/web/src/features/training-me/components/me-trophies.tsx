'use client'

import { useState } from 'react'
import type { Trophy } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Les jalons de la formation (règles GLA, `computeTrophies`) en vitrine : gagnés en or, à décrocher
 * en grisé. C'est la présence VISIBLE des trophées manquants qui donne envie — d'où la grille
 * complète plutôt que la seule liste des acquis.
 *
 * La grille seule ne dit pas COMMENT les décrocher (une infobulle native ne se découvre pas au
 * doigt sur mobile) : chaque tuile et le bouton ouvrent la même modale détaillée, reprise de
 * `openBadgeModal` de l'app d'origine.
 *
 * Feuille client assumée pour tout le composant : la grille est un déclencheur de la modale au
 * même titre que le bouton, la découper en moitié serveur / moitié client coûterait plus qu'elle
 * ne rapporte (aucune donnée sensible, ~90 lignes de présentation).
 */
export function MeTrophies({ trophies }: { trophies: Trophy[] }) {
  const [open, setOpen] = useState(false)
  const earned = trophies.filter((t) => t.earned).length

  return (
    <section className="gla-panel">
      <h2 className="mb-[14px] flex items-center gap-2 text-[15px] font-bold">
        <span aria-hidden>🎖️</span> Trophées
        <span className="ml-auto text-[11.5px] font-semibold tabular-nums text-[var(--gla-muted)]">
          {earned}/{trophies.length}
        </span>
      </h2>

      <ul className="flex flex-wrap gap-2">
        {trophies.map((t) => (
          <li key={t.key}>
            <button
              type="button"
              onClick={() => setOpen(true)}
              title={`${t.label} — ${t.description}`}
              aria-label={`${t.label} — ${t.description} (${t.earned ? 'obtenu' : 'à faire'})`}
              className={cn('gla-badge grid size-[52px] place-items-center text-2xl', t.earned && 'gla-badge-on')}
            >
              <span aria-hidden>{t.emoji}</span>
            </button>
          </li>
        ))}
      </ul>

      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="gla-link mt-3 flex h-auto w-full items-center justify-center gap-1.5 p-[11px] text-[12.5px] font-bold hover:bg-transparent"
      >
        <span aria-hidden>🎯</span> Comment débloquer les trophées ?
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* `gla` : le Dialog est rendu dans un portail sur <body>, donc HORS du conteneur de la
            page — sans ça il retomberait sur le thème du CRM. */}
        <DialogContent className="gla sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              <span aria-hidden className="mr-1.5">🎖️</span> Tes trophées · {earned}/{trophies.length}
            </DialogTitle>
            <DialogDescription>
              Débloque des trophées en t’entraînant régulièrement et en visant les meilleures notes 💪
            </DialogDescription>
          </DialogHeader>
          <ul className="-mx-1 flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-1">
            {trophies.map((t) => (
              <li
                key={t.key}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3',
                  t.earned && 'border-gold/40 bg-gold-soft',
                )}
              >
                <span aria-hidden className={cn('text-2xl leading-none', !t.earned && 'opacity-50 grayscale')}>
                  {t.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{t.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>
                </div>
                <span className={cn('shrink-0 text-sm font-medium', !t.earned && 'text-muted-foreground')}>
                  {t.earned ? '✅ Obtenu' : '🔒 À faire'}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </section>
  )
}
