import { Fragment } from 'react'
import { cn } from '@/lib/utils'

const eur = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

/**
 * Périmètres emboîtés du CA de juin — mêmes chiffres sur chaque onglet (cohérence garantie).
 * `attributed` = total onglet Chatteurs ; `allAccounts` = total onglet Modèles (= MyPuls).
 * ⚠️ Constantes de référence tant que la base n'est pas alimentée ; à dériver du scrape en SQL.
 */
export const REVENUE_SCOPE = {
  attributed: 252856, // Σ CA attribué chatteurs (messagerie PPV+Tips)
  allAccounts: 258853, // total tous comptes MyPuls (= page « Comparatif modèles », privés inclus)
} as const

/** CA des 3 comptes privés (Alice/Carla/Julie privés) — inclus dans allAccounts, hors messagerie chatteur. */
const PRIVATE_ACCOUNTS = 3424

type ScopeKey = keyof typeof REVENUE_SCOPE

const SCOPES: { key: ScopeKey; label: string }[] = [
  { key: 'attributed', label: 'Attribué chatteurs' },
  { key: 'allAccounts', label: 'Total tous comptes (MyPuls)' },
]

/** Bandeau de réconciliation de périmètre. `active` met en avant le total de l'onglet courant. */
export function RevenueScopeNote({ active }: { active: ScopeKey }) {
  const gap = REVENUE_SCOPE.allAccounts - REVENUE_SCOPE.attributed
  const nonMessaging = gap - PRIVATE_ACCOUNTS

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Périmètre du CA · juin 2026
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
                {eur(REVENUE_SCOPE[s.key])}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">
        Écart {eur(gap)} (pas une erreur) :{' '}
        <b className="text-foreground">+{eur(PRIVATE_ACCOUNTS)}</b> comptes privés
        (Alice/Carla/Julie privés) ·{' '}
        <b className="text-foreground">+{eur(nonMessaging)}</b> revenus hors messagerie (renew,
        médias on-demand/push, non imputables à un chatteur).
      </p>
    </div>
  )
}
