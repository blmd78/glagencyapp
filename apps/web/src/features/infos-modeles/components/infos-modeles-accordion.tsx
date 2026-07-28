'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CollapsibleSection } from '@/components/collapsible-section'
import { cn } from '@/lib/utils'
import { BaseBlock, SectionBlock } from './infos-modeles-sections'
import type { ModeleInfos } from '../types'

/**
 * Accordéon d'un modèle : en-tête (nom + résumé replié) + contenu déplié (bloc identité +
 * sections) + bouton Modifier (admin). Extrait de `infos-modeles-view.tsx` (split > 300 l.).
 *
 * Repose sur `CollapsibleSection`, le markup repliable partagé de l'app (2026-07-27) : c'était
 * ici le dernier PANNEAU fait-main — chevron vers le bas pivotant de 180° là où toutes les
 * autres surfaces utilisent un chevron vers la droite à 90°, et un `open && …` sans Radix (donc
 * sans animation ni `aria-expanded`/`aria-controls`). Il reste des dépliants hors de la brique
 * (`model-health-card.tsx`, `insights-view.tsx`, `app-sidebar.tsx`) : ce sont des révélateurs
 * en ligne ou de la navigation, pas des panneaux encadrés — les y forcer ajouterait des
 * bordures là où il n'y en a pas. Contrôlé plutôt que `defaultOpen` : le résumé ne s'affiche
 * QUE replié, il faut donc connaître l'état.
 */
export function ModeleAccordion({ m, isAdmin, onEdit }: { m: ModeleInfos; isAdmin: boolean; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const { base, sections } = m.infos

  const summary =
    [base.age ? `${base.age} ans` : '', base.ville || '', base.statut || ''].filter(Boolean).join(' · ') || null
  const hasContent = Object.values(base).some(Boolean) || sections.length > 0

  return (
    <CollapsibleSection
      open={open}
      onOpenChange={setOpen}
      density="confortable"
      trigger={
        <>
          {/* `span` et non `div`/`p` : le trigger vit dans un `<button>` (lui-même sous le `h2`
              de `CollapsibleSection`), qui n'accepte que du contenu de phrasé. */}
          <span className="block min-w-0 flex-1">
            <span className="block text-base font-semibold leading-tight">{m.model}</span>
            {!open && summary && (
              <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                {summary}
              </span>
            )}
          </span>
          {sections.length > 0 && (
            <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
              {sections.length} section{sections.length > 1 ? 's' : ''}
            </span>
          )}
        </>
      }
    >
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
    </CollapsibleSection>
  )
}
