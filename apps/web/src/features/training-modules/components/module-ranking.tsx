import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { ModuleRankRow } from '../services/get-module-ranking'

/**
 * Classement complet du module : prénoms d'affichage et agrégats, jamais d'e-mail ni de contenu —
 * même contrat que le classement général de « Ma formation ». Ma ligne est mise en avant.
 */
export function ModuleRanking({ rows, myProfileId }: { rows: ModuleRankRow[]; myProfileId: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Personne n’a encore de résultat sur ce module.</p>
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Chatter</TableHead>
            <TableHead className="w-20 text-right">Points</TableHead>
            <TableHead className="w-16 text-right">Cas</TableHead>
            <TableHead className="w-20 text-right">Moyenne</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.profileId} className={cn(r.profileId === myProfileId && 'bg-muted/40 font-medium')}>
              <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
              <TableCell>{r.displayName}</TableCell>
              <TableCell className="text-right tabular-nums">{r.points}</TableCell>
              <TableCell className="text-right tabular-nums">{r.casesDone}</TableCell>
              <TableCell className="text-right tabular-nums">{r.avgTotal == null ? '—' : Math.round(r.avgTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
