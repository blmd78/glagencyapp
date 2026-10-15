import { frDateTimeParis, wheelWeekLabel } from '@glagency/core'
import { Podium } from '@/components/training/podium'
import { AVATAR_BG, MEDAL } from '@/components/training/rank-list'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { eur } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ChatterGains, WheelHistory as WheelHistoryData } from '../types'

/**
 * Historique encadrant (droit Suivi) : tous les tirages, groupés par semaine RÉCOMPENSÉE, la plus
 * récente dépliée. Aucun bouton « payer » — le versement se règle en compta (décision du plan) ;
 * cette page ne fait que dire ce qui est dû.
 */
export function WheelHistory({ history }: { history: WheelHistoryData }) {
  if (history.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun tirage sur cette période.</p>
  }

  return (
    <section className="flex flex-col gap-4">
      <GainsPeriode gains={history.byChatter} totalEur={history.totalEur} spins={history.rows.length} />
      <div className="flex flex-col gap-3">
        {history.byWeek.map((w, i) => (
          <details key={w.week} open={i === 0} className="rounded-xl border px-4 py-3">
            <summary className="cursor-pointer text-sm">
              <span className="font-medium">{wheelWeekLabel(w.week)}</span>{' '}
              <span className="text-muted-foreground">
                — {w.count} tirage{w.count > 1 ? 's' : ''}, {eur(w.totalEur)}
              </span>
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {w.byChatter.length > 0 && (
                <div className="gla-panel">
                  <h3 className="mb-2.5 flex items-center gap-2 text-[13.5px] font-bold">
                    <span aria-hidden>🏆</span> Gains de la semaine
                    <span className="ml-auto text-[11.5px] font-semibold text-[var(--gla-muted)]">
                      {w.byChatter.length} gagnant{w.byChatter.length > 1 ? 's' : ''}
                    </span>
                  </h3>
                  <GainsList gains={w.byChatter} />
                </div>
              )}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chatter</TableHead>
                      <TableHead className="w-32">Date</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead className="w-44">Origine</TableHead>
                      <TableHead className="w-32">Lancé par</TableHead>
                      <TableHead className="w-28 text-right">Montant</TableHead>
                      <TableHead className="w-24">Payé</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.rows
                      .filter((r) => r.week === w.week)
                      .map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.displayName}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{frDateTimeParis(r.spunAt)}</TableCell>
                          <TableCell className={r.won ? undefined : 'text-muted-foreground'}>{r.won ? (r.prizeLabel ?? '—') : 'Raté'}</TableCell>
                          <TableCell className="text-muted-foreground">{r.origine}</TableCell>
                          {/* Le seul garde-fou du modèle « accès libre » : chaque versement est imputable. */}
                          <TableCell className="text-muted-foreground">{r.spunByName ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.amountEur == null ? '—' : eur(r.amountEur)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {!r.won || r.amountEur == null ? '—' : r.paidAt ? '✓' : 'à venir'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

/**
 * Le récap de la période, dans le décor de la roue (demande Benoit, 2026-10-15 : un tableau « ne
 * donne pas envie ») : le total en grand, le podium des trois plus gros gagnants — le même que
 * celui de « Ma formation » —, puis TOUS les gagnants, pour que la compta paie sans additionner.
 */
function GainsPeriode({ gains, totalEur, spins }: { gains: ChatterGains[]; totalEur: number; spins: number }) {
  return (
    <section className="gla-panel">
      <h2 className="mb-[14px] flex items-center gap-2 text-[15px] font-bold">
        <span aria-hidden>💰</span> Gains de la période
        <span className="ml-auto text-[11.5px] font-semibold text-[var(--gla-muted)]">
          {spins} tirage{spins > 1 ? 's' : ''} · {gains.length} gagnant{gains.length > 1 ? 's' : ''}
        </span>
      </h2>
      <p className="mb-4 text-center">
        <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--gla-muted)]">Total gagné</span>
        <span className="text-[34px] font-extrabold tabular-nums text-[var(--gla-gold)] [text-shadow:0_0_24px_rgba(255,207,92,0.35)]">
          {eur(totalEur)}
        </span>
      </p>
      {gains.length === 0 ? (
        <p className="text-center text-[12.5px] text-[var(--gla-muted)]">Aucun gain en argent sur la période.</p>
      ) : (
        <>
          <Podium rows={gains.map((g) => ({ profileId: g.profileId, displayName: g.displayName, points: g.totalEur }))} format={eur} />
          <GainsList gains={gains} />
        </>
      )}
    </section>
  )
}

/**
 * Tous les gagnants, du plus gros total au plus petit, avec les repères du classement de la
 * formation (`RankList`) : médaille et pastille or / argent / bronze pour les trois premiers, puis
 * une barre à la mesure du premier et le montant en or.
 */
function GainsList({ gains }: { gains: ChatterGains[] }) {
  const max = gains[0]?.totalEur ?? 0
  return (
    <ol className="flex flex-col gap-1.5">
      {gains.map((g, i) => {
        const top = i < 3
        return (
          <li key={g.profileId} className={cn('flex items-center gap-2.5 rounded-xl px-2.5 py-2', top && 'bg-[var(--gla-surface2)]')}>
            <span className="w-[18px] text-center" aria-hidden>
              {MEDAL[i] ?? <span className="text-xs font-bold text-[var(--gla-faint)]">{i + 1}</span>}
            </span>
            <span
              aria-hidden
              className="inline-flex size-7 flex-none items-center justify-center rounded-full text-xs font-extrabold"
              style={{ background: AVATAR_BG[i] ?? 'var(--gla-surface3)', color: top ? '#1a1204' : 'var(--gla-text)' }}
            >
              {g.displayName.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{g.displayName}</span>
            <span className="gla-bar hidden h-1.5 w-24 sm:block" aria-hidden>
              <i style={{ width: `${max > 0 ? (g.totalEur / max) * 100 : 0}%` }} />
            </span>
            <span className="w-20 text-right text-sm font-extrabold tabular-nums text-[var(--gla-gold)]">{eur(g.totalEur)}</span>
          </li>
        )
      })}
    </ol>
  )
}
