import { frDateTimeParis } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { ScoreBadge } from '@/components/training/score-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import type { MeSession } from '../types'

/** Statut d'une session en clair — une session notée affiche sa note (badge), pas un mot. */
function statusLabel(s: MeSession): string {
  if (s.status === 'scored') return 'Notée'
  if (s.status === 'failed') return 'Raté'
  if (s.status === 'abandoned') return 'Abandonnée'
  if (s.status === 'active') return 'En cours'
  return s.status
}

/** Les 50 dernières sessions du visiteur, de la plus récente à la plus ancienne. */
export function MeHistory({ sessions }: { sessions: MeSession[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune session pour l’instant — commence par un cas dans Modules.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {/* La requête est bornée à 50 : le dire, plutôt qu'afficher un compteur qui plafonnerait. */}
      <p className="text-sm text-muted-foreground">Tes 50 dernières sessions, de la plus récente à la plus ancienne.</p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Date</TableHead>
              <TableHead>Cas</TableHead>
              <TableHead>Module</TableHead>
              <TableHead className="w-32">Sorte</TableHead>
              <TableHead className="w-28">Résultat</TableHead>
              <TableHead className="w-20 text-right">Détail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="tabular-nums text-muted-foreground">{frDateTimeParis(s.startedAt)}</TableCell>
                <TableCell className="font-medium">{s.caseTitle}</TableCell>
                <TableCell className="text-muted-foreground">{s.moduleTitle || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{CASE_KIND_LABELS[s.kind]}</TableCell>
                <TableCell className="tabular-nums">
                  {s.status === 'scored' && s.total != null ? <ScoreBadge total={s.total} /> : statusLabel(s)}
                </TableCell>
                <TableCell className="text-right">
                  {/* `as Route` : typedRoutes n'accepte pas une chaîne interpolée sur un segment dynamique. */}
                  <Link href={`/formation/session/${s.id}` as Route} className="text-sm hover:underline">
                    Voir
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
