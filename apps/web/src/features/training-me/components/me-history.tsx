import { frDateTimeParis } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import type { MeSession } from '../types'

/** Statut d'une session en clair — une note notée vaut mieux qu'un mot. */
function statusLabel(s: MeSession): string {
  if (s.status === 'scored') return s.total == null ? 'Notée' : `${s.total}/100`
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
              <TableCell className="tabular-nums">{statusLabel(s)}</TableCell>
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
  )
}
