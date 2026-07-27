'use client'

import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { CollapsibleSection } from '@/components/collapsible-section'
import { cn } from '@/lib/utils'
import { ROLE_NAME, ROLE_TONE } from '@/lib/roles'
import type { SelectableMember } from '@/lib/types/member'

/**
 * Pile de noms, un par ligne, dépliables sur un panneau propre à chaque personne (maquette du
 * propriétaire, 2026-07-26). Sert le Planning et le Dashboard ; le markup repliable lui-même
 * vient de `CollapsibleSection`, partagé avec la To-do.
 *
 * UN SEUL panneau ouvert à la fois (choix produit) : ouvrir un nom referme le précédent, la page
 * reste courte. Corollaire technique : Radix DÉMONTE le panneau fermé, donc l'état interne d'un
 * panneau (jour sélectionné, formulaire, dialog) repart propre à chaque ouverture — rien ne fuit
 * d'une personne à l'autre.
 *
 * `hint`, `onOpen` et `children` sont des fonctions : les appelants sont donc forcément des
 * composants client (une fonction ne traverse pas la frontière RSC).
 */
export function MembersAccordion<T extends SelectableMember>({
  items,
  hint,
  onOpen,
  children,
}: {
  items: T[]
  /** Repère affiché à droite du nom, LISIBLE SANS DÉPLIER. Rien si omis. */
  hint?: (item: T) => ReactNode
  /** Appelé à l'OUVERTURE d'une ligne — sert le chargement à la demande du panneau. */
  onOpen?: (item: T) => void
  /** Panneau de la personne — monté seulement quand sa ligne est ouverte. */
  children: (item: T) => ReactNode
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        // '' pour soi-même → pas de badge (on sait qui on est).
        const role = ROLE_NAME[item.role]
        return (
          <CollapsibleSection
            key={item.id}
            open={openId === item.id}
            onOpenChange={(o) => {
              setOpenId(o ? item.id : null)
              if (o) onOpen?.(item)
            }}
            contentClassName="p-4 sm:p-5"
            trigger={
              <>
                <span>{item.name}</span>
                {role && (
                  <Badge className={cn('shrink-0 text-xs font-normal', ROLE_TONE[item.role])}>
                    {role}
                  </Badge>
                )}
                {hint && (
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {hint(item)}
                  </span>
                )}
              </>
            }
          >
            {children(item)}
          </CollapsibleSection>
        )
      })}
    </div>
  )
}
