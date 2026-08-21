import { frDateTimeParis } from '@glagency/core'
import Link from 'next/link'
import type { Route } from 'next'
import { ScoreBadge } from '@/components/training/score-badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import type { ChatterDetail } from '../types'

/** Barème d'un axe (solo / défi) — même échelle que le détail de note d'une session. */
const AXIS_MAX = 25

/** Statut d'une session en clair — une session notée affiche sa note (badge), pas un mot. */
function statusLabel(status: string): string {
  if (status === 'scored') return 'Notée'
  if (status === 'failed') return 'Raté'
  if (status === 'abandoned') return 'Abandonnée'
  if (status === 'active') return 'En cours'
  return status
}

/**
 * Fiche d'un chatter pour l'encadrant : ses points faibles (moyennes par axe, du plus faible au
 * plus fort — l'ordre vient de la RPC `training_axis_profile`), ses meilleurs résultats par cas,
 * puis ses 50 dernières sessions. Le nom vient du roster (prop) : la fiche ne le re-requête pas.
 */
export function OverviewChatter({ detail, displayName }: { detail: ChatterDetail; displayName: string }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{displayName}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/formation/overview">Tous les chatters</Link>
        </Button>
      </div>

      <section className="flex flex-col gap-4">
        <h3 className="text-base font-semibold tracking-tight">Points faibles</h3>
        {detail.axes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune session notée — pas encore d’axe mesuré.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {detail.axes.map((a) => (
              <div key={a.key} className="flex flex-col gap-1">
                <p className="flex items-baseline justify-between text-sm">
                  <span>{a.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {a.avg}/{AXIS_MAX} · {a.n} note{a.n > 1 ? 's' : ''}
                  </span>
                </p>
                <div className="h-2 overflow-hidden rounded bg-muted">
                  <div className="h-full rounded bg-foreground" style={{ width: `${Math.min(100, (a.avg / AXIS_MAX) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold tracking-tight">Cas</h3>
        {detail.bests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun cas validé pour l’instant.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cas</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead className="w-32">Sorte</TableHead>
                  <TableHead className="w-36">Meilleur</TableHead>
                  <TableHead className="w-24 text-right">Essais</TableHead>
                  <TableHead className="w-32">Dernier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.bests.map((b) => (
                  <TableRow key={b.caseId}>
                    <TableCell className="font-medium">{b.caseTitle}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {/* `as Route` : typedRoutes n'accepte pas une chaîne interpolée sur un segment dynamique. */}
                      <Link href={`/formation/modules/${b.moduleCode}?vue=cas` as Route} className="hover:underline">
                        {b.moduleTitle}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{CASE_KIND_LABELS[b.kind]}</TableCell>
                    <TableCell>
                      <ScoreBadge total={b.bestTotal} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.attempts}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{frDateTimeParis(b.lastAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold tracking-tight">Sessions</h3>
        {detail.sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune session pour l’instant.</p>
        ) : (
          <>
            {/* La requête est bornée à 50 : le dire, plutôt qu'afficher un compteur qui plafonnerait. */}
            <p className="text-sm text-muted-foreground">Ses 50 dernières sessions, de la plus récente à la plus ancienne.</p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Date</TableHead>
                    <TableHead>Cas</TableHead>
                    <TableHead className="w-32">Sorte</TableHead>
                    <TableHead className="w-28">Résultat</TableHead>
                    <TableHead className="w-20 text-right">Détail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="tabular-nums text-muted-foreground">{frDateTimeParis(s.startedAt)}</TableCell>
                      <TableCell className="font-medium">{s.caseTitle}</TableCell>
                      <TableCell className="text-muted-foreground">{CASE_KIND_LABELS[s.kind]}</TableCell>
                      <TableCell className="tabular-nums">
                        {s.status === 'scored' && s.total != null ? <ScoreBadge total={s.total} /> : statusLabel(s.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/formation/session/${s.id}` as Route} className="text-sm hover:underline">
                          Voir
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
