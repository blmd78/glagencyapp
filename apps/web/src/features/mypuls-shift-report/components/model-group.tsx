import { ChevronRight } from 'lucide-react'
import { ChatterRow } from './chatter-row'
import type { ModelGroup as ModelGroupData } from '../types'

/**
 * Une carte par modèle, reprise de l'ancien board (`card modelgroup`, .tracker-ref/board.html) :
 * en-tête « Alice · 12 chatters · 3 ont manqué des jours », puis les lignes.
 *
 * `<details>` natif comme chez eux : l'ouverture ne coûte pas un octet de JavaScript, et la page
 * reste un Server Component de bout en bout.
 *
 * Repliée par défaut dès que la vue est longue. Sur une période d'un mois, l'effectif entier
 * déplié portait le DOM bien au-delà du seuil d'alerte Lighthouse, pour un contenu que personne
 * ne lit d'un bloc — les cartes qui comptent sont celles qui portent un manque, et l'en-tête le
 * dit sans qu'on ait à ouvrir.
 */
export function ModelGroup({
  group,
  threshold,
  open,
  canReport,
}: {
  group: ModelGroupData
  threshold: number
  /** Carte dépliée d'emblée — seulement quand la vue est courte. */
  open: boolean
  canReport: boolean
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
                {group.belowCount} {group.belowCount > 1 ? 'ont manqué des jours' : 'a manqué des jours'}
              </span>
            </>
          )}
        </span>
      </summary>

      <div className="border-t">
        {/* En-tête de colonnes — le `div.thead` de l'ancien board. Masqué en petit écran, où la
            grille se réduit et où les libellés seraient illisibles. */}
        <div className="hidden grid-cols-[0.5rem_minmax(9rem,1fr)_minmax(11rem,1.6fr)_5rem_5rem] items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:grid">
          <span />
          <span>Chatter</span>
          <span>Jours tenus sur son créneau</span>
          <span className="text-right">Actif</span>
          <span className="text-right">Retard moy.</span>
        </div>
        {group.rows.map((row) => (
          <ChatterRow key={row.key} row={row} threshold={threshold} canReport={canReport} />
        ))}
      </div>
    </details>
  )
}
