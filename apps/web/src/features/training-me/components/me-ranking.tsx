import { WHEEL_TOP_N } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { MeData, RankRow, WeeklyRankRow } from '../types'

/**
 * Classement de l'équipe (semaine en cours, dernière semaine complète ou global — sélecteur
 * `MeRankingSelect`) : prénoms d'affichage et agrégats, jamais d'e-mail ni de contenu. Ma ligne
 * est mise en avant partout ; en vues hebdo, le top 3 (récompensé d'un tour de roue) l'est aussi,
 * discrètement.
 */
export function MeRanking({ data, myProfileId }: { data: MeData; myProfileId: string }) {
  const { rankingScope, ranking, weeklyRanking } = data
  if (rankingScope === 'global') return <GlobalTable rows={ranking} myProfileId={myProfileId} />
  return <WeeklyTable rows={weeklyRanking ?? []} myProfileId={myProfileId} />
}

function GlobalTable({ rows, myProfileId }: { rows: RankRow[]; myProfileId: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Personne n’a encore de résultat.</p>
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
            <TableHead className="w-16 text-right">Série</TableHead>
            <TableHead className="w-14 text-center">Boss</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
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
  )
}

function WeeklyTable({ rows, myProfileId }: { rows: WeeklyRankRow[]; myProfileId: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Personne n’a encore de résultat cette semaine-là.</p>
  }
  return (
    <div className="flex flex-col gap-3">
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
              <TableRow
                key={r.profileId}
                // Même condition que les deux portes qui décident réellement (`claimTicket` et
                // `training_wheel_pending`) : top N ET au moins 1 point. Un 3e à 0 point (défi dont
                // les 5 conversations ont expiré) n'a PAS de tour — ne pas le lui laisser croire.
                className={cn(i < WHEEL_TOP_N && r.points > 0 && 'font-medium', r.profileId === myProfileId && 'bg-muted/40 font-medium')}
              >
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
      <p className="text-sm text-muted-foreground">Top 3 de la semaine, avec au moins 1 point, = un tour de roue.</p>
    </div>
  )
}
