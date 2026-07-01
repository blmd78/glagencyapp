import { Fragment } from 'react'
import { cn } from '@/lib/utils'

const eur = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

/**
 * Périmètres emboîtés du CA de juin — mêmes chiffres sur chaque onglet (cohérence garantie).
 * `attributed` = total onglet Chatteurs (money-team, PPV+Tips attribués à un chatteur).
 * `messaging`  = messagerie tous comptes (API by_type : Média privé + Pourboires).
 * `allAccounts`= total onglet Modèles = total MyPuls (tous types, tous comptes).
 * ⚠️ Constantes de référence tant que la base n'est pas alimentée ; à dériver du scrape en SQL.
 */
export const REVENUE_SCOPE = {
  attributed: 252856,
  messaging: 255998,
  allAccounts: 258853,
} as const

type ScopeKey = keyof typeof REVENUE_SCOPE

const SCOPES: { key: ScopeKey; label: string }[] = [
  { key: 'attributed', label: 'Attribué chatteurs' },
  { key: 'messaging', label: 'Messagerie tous comptes' },
  { key: 'allAccounts', label: 'Total MyPuls' },
]

/** Bandeau de réconciliation de périmètre. `active` met en avant le total de l'onglet courant. */
export function RevenueScopeNote({ active }: { active: ScopeKey }) {
  const notAttributed = REVENUE_SCOPE.messaging - REVENUE_SCOPE.attributed
  const offMessaging = REVENUE_SCOPE.allAccounts - REVENUE_SCOPE.messaging

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
      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
        Écart {eur(REVENUE_SCOPE.allAccounts - REVENUE_SCOPE.attributed)} (pas une erreur) :{' '}
        <b className="text-foreground">+{eur(notAttributed)}</b> messagerie non attribuée à un
        chatteur (comptes privés + rattachement) ·{' '}
        <b className="text-foreground">+{eur(offMessaging)}</b> hors messagerie (Médias push,
        Media On Demand, Renouvellement abo.).
      </p>
    </div>
  )
}
