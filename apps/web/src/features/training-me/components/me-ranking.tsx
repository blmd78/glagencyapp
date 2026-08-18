import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { RankRow } from '../types'

/**
 * Classement de l'équipe (RPC `training_ranking` : prénoms d'affichage et agrégats, jamais
 * d'e-mail ni de contenu), trié par points puis moyenne. Ma ligne est mise en avant.
 */
export function MeRanking({ ranking, myProfileId }: { ranking: RankRow[]; myProfileId: string }) {
  if (ranking.length === 0) {
    return <p className="text-sm text-muted-foreground">Personne n’a encore de résultat.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Chatter</TableHead>
              <TableHead className="w-20 text-right">Points</TableHead>
              <TableHead className="w-16 text-right">Cas</TableHead>
              <TableHead className="w-20 text-right">Moyenne</TableHead>
              <TableHead className="w-16 text-right">Série</TableHead>
              <TableHead className="w-14 text-center">Boss</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranking.map((r, i) => (
              <TableRow key={r.profileId} className={cn(r.profileId === myProfileId && 'bg-muted/40 font-medium')}>
                <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  {r.displayName}
                  {r.isNew && <Badge variant="outline" className="ml-2">nouveau</Badge>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.points}</TableCell>
                <TableCell className="text-right tabular-nums">{r.casesDone}</TableCell>
                <TableCell className="text-right tabular-nums">{r.avgTotal == null ? '—' : Math.round(r.avgTotal)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.streakDays} j</TableCell>
                <TableCell className="text-center">{r.bossDone ? '✓' : ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">Le classement sert aux récompenses (roue) — à venir.</p>
    </div>
  )
}
