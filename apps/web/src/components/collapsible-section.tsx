'use client'

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

/**
 * Panneau repliable encadré — LE markup unique des sections dépliables de l'app (pile de noms
 * du Planning/Dashboard, sections par statut de la To-do). Il n'existait pas : les trois
 * endroits recopiaient les mêmes 6 chaînes de classes, et avaient déjà divergé sur le padding
 * du trigger.
 *
 * Contrôlé (`open` + `onOpenChange`, pour un accordéon « un seul ouvert à la fois ») OU non
 * contrôlé (`defaultOpen`, pour des sections indépendantes) — Radix accepte les deux, il suffit
 * de ne pas passer `open`.
 *
 * Le `<h2 className="contents">` met le titre dans l'arbre d'accessibilité (navigation par
 * titres) sans créer de boîte : la mise en page du trigger reste celle d'un simple flex.
 */
/**
 * Densité du trigger — une ÉCHELLE de deux valeurs, pas une classe libre : le reste du langage
 * visuel (cadre, chevron, hover, filet) n'est pas surchargeable, pour qu'aucune page ne puisse
 * réinventer sa variante. `compact` = listes serrées (noms, statuts) ; `confortable` = fiches
 * dont l'en-tête porte plusieurs lignes.
 */
const TRIGGER_DENSITY = {
  compact: 'gap-2 px-3 py-3 text-sm',
  confortable: 'gap-3 px-5 py-4 text-base',
} as const

export function CollapsibleSection({
  trigger,
  children,
  open,
  onOpenChange,
  defaultOpen,
  density = 'compact',
  contentClassName,
}: {
  /** Contenu du trigger, APRÈS le chevron (nom, badge, compteur…). */
  trigger: ReactNode
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  density?: keyof typeof TRIGGER_DENSITY
  /** Padding du panneau — absent = le contenu gère le sien (listes `divide-y`). */
  contentClassName?: string
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      defaultOpen={defaultOpen}
      // `overflow-hidden` : sans lui, le dernier bloc du panneau déborde des coins arrondis.
      className="overflow-hidden rounded-md border bg-card"
    >
      <h2 className="contents">
        <CollapsibleTrigger
          className={cn(
            'group flex w-full items-center text-left font-medium transition-colors hover:bg-muted/50',
            TRIGGER_DENSITY[density],
          )}
        >
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          {trigger}
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent className={cn('border-t', contentClassName)}>{children}</CollapsibleContent>
    </Collapsible>
  )
}
