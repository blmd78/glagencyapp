'use client'

import { useState } from 'react'
import { ChevronDown, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BaseBlock, SectionBlock } from './infos-modeles-sections'
import type { ModeleInfos } from '../types'

/**
 * Accordéon d'un modèle : en-tête (nom + résumé replié) + contenu déplié (bloc identité +
 * sections) + bouton Modifier (admin). Extrait de `infos-modeles-view.tsx` (split > 300 l.).
 */
export function ModeleAccordion({ m, isAdmin, onEdit }: { m: ModeleInfos; isAdmin: boolean; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const { base, sections } = m.infos

  const summary =
    [base.age ? `${base.age} ans` : '', base.ville || '', base.statut || ''].filter(Boolean).join(' · ') || null
  const hasContent = Object.values(base).some(Boolean) || sections.length > 0

  return (
    <div className="overflow-hidden rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight">{m.model}</p>
          {!open && summary && <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p>}
        </div>
        {sections.length > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {sections.length} section{sections.length > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t">
          {!hasContent ? (
            <p className="px-5 py-10 text-center text-sm italic text-muted-foreground">
              Aucune information renseignée{isAdmin ? ' — clique Modifier pour remplir la fiche.' : '.'}
            </p>
          ) : (
            <div className="px-5 py-5">
              <BaseBlock base={base} />
              {sections.map((s, i) => (
                <div key={i} className={cn('pt-5', (i > 0 || Object.values(base).some(Boolean)) && 'mt-1 border-t')}>
                  <SectionBlock section={s} />
                </div>
              ))}
            </div>
          )}
          {isAdmin && (
            <div className="flex justify-end border-t px-5 py-3">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
                <Pencil className="size-3.5" /> Modifier
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
