import {
  DEPARTURE_INITIATIVE,
  DEPARTURE_LABEL,
  INITIATIVE_LABEL,
  type DepartureInitiative,
  type DepartureReason,
} from '@glagency/core'
import { cn } from '@/lib/utils'

/** Ordre de lecture : ce que l'agence a décidé d'abord, ce qu'elle a subi ensuite. */
const ORDRE: DepartureInitiative[] = ['agence', 'chatteur', 'autre']

/** Le point de couleur qui code l'initiative — même sémantique que `STATUS_COLORS` : ce qu'on
 *  décide est neutre, ce qu'on subit appelle l'œil. */
const DOT: Record<DepartureInitiative, string> = {
  agence: 'bg-blue-500',
  chatteur: 'bg-amber-500',
  autre: 'bg-zinc-400',
}
const BAR: Record<DepartureInitiative, string> = {
  agence: 'bg-blue-500/70',
  chatteur: 'bg-amber-500/70',
  autre: 'bg-zinc-400/70',
}

/**
 * Répartition des motifs de départ, GROUPÉE PAR QUI A DÉCIDÉ.
 *
 * Les motifs étaient rendus en badges gris identiques, alignés en vrac : rien ne hiérarchisait, le
 * nombre se confondait avec le libellé, et surtout ça ne répondait pas à la question qu'on se pose
 * en lisant un turnover — combien de départs je décide, combien je subis. Deux problèmes
 * différents : l'un interroge le recrutement, l'autre les conditions de travail.
 *
 * Une ligne par motif, avec sa part de l'ensemble. La barre est un REPÈRE de proportion, pas un
 * graphe : pas d'axe, pas d'échelle — comparer cinq valeurs entières se fait à l'œil, et un
 * `BarChart` pour ça pèserait plus que ce qu'il apprend.
 */
export function ReasonBreakdown({
  reasons,
  total,
}: {
  reasons: { reason: string; n: number }[]
  /** Total des départs de la période — dénominateur des parts. */
  total: number
}) {
  const byInitiative = ORDRE.map((initiative) => {
    const lignes = reasons
      .filter((r) => (DEPARTURE_INITIATIVE[r.reason as DepartureReason] ?? 'autre') === initiative)
      .sort((a, b) => b.n - a.n)
    return { initiative, lignes, sousTotal: lignes.reduce((s, l) => s + l.n, 0) }
  }).filter((g) => g.lignes.length > 0)

  // Dénominateur DÉFENSIF : `total` vient d'un autre agrégat du RPC (`tenure.exits`) que la somme
  // des motifs — un départ sans motif ne peut pas exister (check SQL 0102), mais si les deux
  // divergeaient un jour, mieux vaut des parts qui somment à 100 % qu'une division par zéro.
  const denom = Math.max(total, reasons.reduce((s, r) => s + r.n, 0), 1)

  return (
    <div className="flex flex-col gap-4">
      {byInitiative.map((g) => (
        <div key={g.initiative} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className={cn('size-2 shrink-0 rounded-full', DOT[g.initiative])} />
              {INITIATIVE_LABEL[g.initiative]}
            </span>
            <span className="text-sm font-semibold tabular-nums">{g.sousTotal}</span>
          </div>

          {g.lignes.map((l) => (
            <div key={l.reason} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm">
                {DEPARTURE_LABEL[l.reason as DepartureReason] ?? l.reason}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full', BAR[g.initiative])}
                  style={{ width: `${(l.n / denom) * 100}%` }}
                />
              </span>
              <span className="w-14 shrink-0 text-right text-sm tabular-nums">
                {l.n}
                <span className="ml-1 text-xs text-muted-foreground">
                  {Math.round((l.n / denom) * 100)}%
                </span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
