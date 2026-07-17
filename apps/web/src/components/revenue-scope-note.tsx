import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { eur } from '@/lib/format'
import type { RevenueScope } from '@/lib/types/revenue'

type ScopeKey = keyof RevenueScope

const SCOPES: { key: ScopeKey; label: string }[] = [
  { key: 'attributed', label: 'Attribué chatteurs' },
  { key: 'messaging', label: 'Messagerie tous comptes' },
  { key: 'allAccounts', label: 'Total MyPuls' },
]

/** Bandeau de réconciliation de périmètre. `active` met en avant le total de l'onglet courant. */
export function RevenueScopeNote({
  scope,
  active,
  periodLabel,
}: {
  scope: RevenueScope
  active: ScopeKey
  periodLabel: string
}) {
  const notAttributed = Math.max(0, scope.messaging - scope.attributed)
  const offMessaging = Math.max(0, scope.allAccounts - scope.messaging)
  const gap = Math.round(scope.allAccounts - scope.attributed)

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Périmètre du CA · {periodLabel}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SCOPES.map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 && <span className="text-muted-foreground">⊂</span>}
            <div
              className={cn(
                'rounded-lg border px-3 py-1.5',
                s.key === active
                  ? 'border-primary/40 bg-background ring-1 ring-primary/20'
                  : 'bg-background/50',
              )}
            >
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
              <div
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  s.key === active && 'text-primary',
                )}
              >
                {eur(scope[s.key])}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
      {gap > 0 && (
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          Écart {eur(gap)} (pas une erreur) :{' '}
          <b className="text-foreground">+{eur(notAttributed)}</b> messagerie non attribuée à un
          chatteur (comptes privés + rattachement) ·{' '}
          <b className="text-foreground">+{eur(offMessaging)}</b> hors messagerie (Médias push,
          Media On Demand, Renouvellement abo.).
        </p>
      )}
    </div>
  )
}
