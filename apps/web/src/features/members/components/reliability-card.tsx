import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { frDateNumeric, frDayShort } from '@glagency/core'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { CHECK_LABEL } from '../identity-issues'
import type { IdentityData, ReliabilityDay } from '../types'

const STATUS: Record<ReliabilityDay['status'], { label: string; color: string }> = {
  ok: { label: 'Vérifié', color: STATUS_COLORS.positive },
  a_verifier: { label: 'À vérifier', color: STATUS_COLORS.warning },
  non_verifie: { label: 'Non vérifié', color: STATUS_COLORS.neutral },
}

/**
 * Statut de fiabilité du dernier relevé (spec § 3, § 7) : verdict du dernier jour ingéré, détail
 * des contrôles en échec, historique des derniers jours. Badge de statut = patron Uncove
 * (`uncove-accounts.client.tsx:165`).
 */
export function ReliabilityCard({ reliability }: { reliability: IdentityData['reliability'] }) {
  const latest = reliability.latest
  const failed = latest?.checks.filter((c) => !c.ok) ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fiabilité des chiffres</CardTitle>
        <CardDescription>
          Chaque nuit, trois contrôles comparent nos chiffres à MyPuls : résumé = ventes pour chaque compte, totaux en base =
          totaux MyPuls, une fiche = un compte.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {latest ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={cn('text-xs', STATUS[latest.status].color)}>{STATUS[latest.status].label}</Badge>
            <span className="text-sm">Relevé du {frDateNumeric(latest.day)}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun jour ingéré.</p>
        )}
        {latest?.status === 'non_verifie' && (
          <p className="text-sm text-muted-foreground">
            Ce jour n&apos;a pas été contrôlé : le relevé chatteurs a échoué ou n&apos;a pas tourné.
          </p>
        )}
        {failed.length > 0 && (
          <ul className="flex flex-col">
            {failed.map((c, i) => (
              <li key={`${c.code}-${i}`} className="flex flex-col gap-0.5 border-b py-2 last:border-0">
                <span className="font-medium">{CHECK_LABEL[c.code] ?? c.code}</span>
                <span className="text-sm text-muted-foreground">{c.detail}</span>
              </li>
            ))}
          </ul>
        )}
        {reliability.history.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {reliability.history.map((d) => (
              <Badge key={d.day} className={cn('text-xs', STATUS[d.status].color)} title={STATUS[d.status].label}>
                {frDayShort(d.day)}
                <span className="sr-only"> : {STATUS[d.status].label}</span>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
