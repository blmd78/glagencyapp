import { ChevronRight } from 'lucide-react'
import { ChatterRow } from './chatter-row'
import type { ModelGroup as ModelGroupData } from '../types'

/**
 * Une carte par modèle, reprise de l'ancien board (`card modelgroup`, .tracker-ref/board.html) :
 * en-tête « Alice · 2 chatters · 2 sous le seuil », puis les lignes.
 *
 * `<details>` natif comme chez eux : l'ouverture ne coûte pas un octet de JavaScript, et la page
 * reste un Server Component de bout en bout. Ouverte par défaut — sur un créneau, l'encadrant
 * veut voir, pas déplier quinze cartes.
 */
export function ModelGroup({
  group,
  threshold,
  showSlot,
  open,
}: {
  group: ModelGroupData
  threshold: number
  /** Journée complète : une même personne peut apparaître sur plusieurs créneaux. */
  showSlot: boolean
  /** Carte dépliée d'emblée. Faux en journée complète, où le DOM atteignait 12 687 éléments. */
  open: boolean
}) {
  return (
    <details open={open} className="group overflow-hidden rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <h2 className="font-medium">{group.model}</h2>
        <span className="text-sm text-muted-foreground">
          {group.rows.length} chatter{group.rows.length > 1 ? 's' : ''}
          {group.belowCount > 0 && (
            <>
              {' · '}
              <span className="font-medium text-red-600 dark:text-red-400">
                {group.belowCount} sous le seuil
              </span>
            </>
          )}
        </span>
      </summary>

      <div className="border-t">
        {/* En-tête de colonnes — le `div.thead` de l'ancien board. Masqué en petit écran, où la
            grille se réduit et où les libellés seraient illisibles. */}
        <div className="hidden grid-cols-[0.5rem_minmax(8rem,1fr)_minmax(12rem,2fr)_5rem_5rem_1rem] items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:grid">
          <span />
          <span>Chatter</span>
          <span>Couverture du créneau</span>
          <span className="text-right">Actif</span>
          <span className="text-right">Retard</span>
          <span />
        </div>
        {group.rows.map((row) => (
          <ChatterRow
            key={`${row.slot}:${row.mypulsUserId}`}
            row={row}
            threshold={threshold}
            showSlot={showSlot}
          />
        ))}
      </div>
    </details>
  )
}
