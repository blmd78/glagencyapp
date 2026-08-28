import { Figure } from '@/components/training/figure'
import { dec2, int } from '@/lib/format'
import { COST_WINDOW_DAYS, type CostRow, type RosterRow } from '../types'

/**
 * Bandeau de tête de l'Overview : les chiffres de la promo, puis — pour un ADMIN seulement — ceux
 * du coût IA. Ils vivaient dans `OverviewCost`, en bas de page, sous deux tableaux : la dépense
 * d'un mois ne se voyait qu'en scrollant. Une seule grille de 4, donc une ligne « promo » puis une
 * ligne « coût » : c'est le même geste de lecture, et le détail par jour reste en bas.
 *
 * Le coût est `null` pour un non-admin (la RLS de `training_ai_calls` est admin-only, le service
 * n'appelle même pas la RPC) — le bandeau se réduit alors à la promo, sans trou dans la grille.
 */
export function OverviewKpis({
  roster,
  cost,
}: {
  roster: RosterRow[]
  cost: { rows: CostRow[]; estimatedUsd: number } | null
}) {
  const newcomers = roster.filter((r) => r.isNew).length
  const bossDone = roster.filter((r) => r.bossDone).length
  // Moyenne de la promo = moyenne des moyennes des chatters NOTÉS. Les sans-note sont exclus, pas
  // comptés 0 : un chatter qui n'a encore rien joué ne doit pas tirer la promo vers le bas.
  const scored = roster.filter((r) => r.avgTotal != null)
  const avg = scored.length ? scored.reduce((n, r) => n + (r.avgTotal ?? 0), 0) / scored.length : null

  const totals = (cost?.rows ?? []).reduce(
    (acc, r) => ({ calls: acc.calls + r.calls, input: acc.input + r.inputTokens, output: acc.output + r.outputTokens }),
    { calls: 0, input: 0, output: 0 },
  )

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Figure label="Chatters" value={int(roster.length)} />
      <Figure label="Nouveaux" value={int(newcomers)} />
      <Figure label="Moyenne promo" value={avg == null ? '—' : int(avg)} />
      <Figure label="Boss validés" value={`${int(bossDone)}/${int(roster.length)}`} />
      {cost && (
        <>
          <Figure label={`Coût IA estimé · ${COST_WINDOW_DAYS} j`} value={`${dec2(cost.estimatedUsd)} $`} />
          <Figure label={`Appels IA · ${COST_WINDOW_DAYS} j`} value={int(totals.calls)} />
          <Figure label={`Tokens entrée · ${COST_WINDOW_DAYS} j`} value={int(totals.input)} />
          <Figure label={`Tokens sortie · ${COST_WINDOW_DAYS} j`} value={int(totals.output)} />
        </>
      )}
    </div>
  )
}
