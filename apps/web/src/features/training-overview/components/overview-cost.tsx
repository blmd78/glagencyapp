import { frDateNumeric } from '@glagency/core'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dec2, int } from '@/lib/format'
import { COST_WINDOW_DAYS, type CostRow } from '../types'

const KIND_LABELS: Record<string, string> = { fan: 'Fan', score: 'Notation' }
/** Lignes visibles avant repli — le détail par jour × modèle × sorte est long sur 30 jours. */
const VISIBLE_ROWS = 10

/**
 * Coût IA de l'entraînement sur 30 jours (ADMIN) : appels, tokens et coût ESTIMÉ aux prix liste
 * Anthropic (la facture réelle peut être plus basse). Le détail par jour × modèle × sorte dit d'où
 * vient la dépense — le fan (haiku, un appel par message) ou la notation (sonnet, un par thread).
 */
export function OverviewCost({ rows, estimatedUsd }: { rows: CostRow[]; estimatedUsd: number }) {
  const totals = rows.reduce(
    (acc, r) => ({
      calls: acc.calls + r.calls,
      input: acc.input + r.inputTokens,
      output: acc.output + r.outputTokens,
      cache: acc.cache + r.cacheReadTokens,
    }),
    { calls: 0, input: 0, output: 0, cache: 0 },
  )
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Coût IA — {COST_WINDOW_DAYS} derniers jours</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun appel IA sur la période.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Appels" value={int(totals.calls)} />
            <Figure label="Tokens entrée" value={int(totals.input)} />
            <Figure label="Tokens sortie" value={int(totals.output)} />
            <Figure label="Coût estimé" value={`${dec2(estimatedUsd)} $`} />
          </div>
          <p className="text-sm text-muted-foreground">
            {int(totals.cache)} tokens lus en cache (facturés ~10 % de l’entrée) · estimation, prix liste — la facture
            réelle peut être plus basse.
          </p>
          <CostTable rows={rows.slice(0, VISIBLE_ROWS)} />
          {rows.length > VISIBLE_ROWS && (
            <details className="rounded-xl border px-4 py-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Voir les {rows.length - VISIBLE_ROWS} autres lignes
              </summary>
              <div className="mt-3">
                <CostTable rows={rows.slice(VISIBLE_ROWS)} />
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function CostTable({ rows }: { rows: CostRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Jour</TableHead>
            <TableHead>Modèle</TableHead>
            <TableHead className="w-28">Sorte</TableHead>
            <TableHead className="w-24 text-right">Appels</TableHead>
            <TableHead className="w-28 text-right">Entrée</TableHead>
            <TableHead className="w-28 text-right">Sortie</TableHead>
            <TableHead className="w-28 text-right">Cache</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.day}-${r.model}-${r.kind}`}>
              <TableCell className="tabular-nums text-muted-foreground">{frDateNumeric(r.day)}</TableCell>
              <TableCell>{r.model}</TableCell>
              <TableCell className="text-muted-foreground">{KIND_LABELS[r.kind] ?? r.kind}</TableCell>
              <TableCell className="text-right tabular-nums">{int(r.calls)}</TableCell>
              <TableCell className="text-right tabular-nums">{int(r.inputTokens)}</TableCell>
              <TableCell className="text-right tabular-nums">{int(r.outputTokens)}</TableCell>
              <TableCell className="text-right tabular-nums">{int(r.cacheReadTokens)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
