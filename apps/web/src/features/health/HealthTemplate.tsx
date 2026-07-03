import { TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { eur, num } from '@/lib/format'
import { KpiGrid } from '@/components/kpi-card'
import { LtvGauge } from './components/ltv-gauge'
import { ModelHealthCard } from './components/model-health-card'
import { StatusBadge } from './components/status-badge'
import type { HealthData } from './types'

/**
 * Template État de santé — tracker d'objectif LTV (repris de l'ancien dashboard) :
 * jauge agence + KPIs, plan de rattrapage vers la cible, cartes par modèle.
 * Aucun fetch ici (convention app → feature(template) → composants).
 */
export function HealthTemplate({ data }: { data: HealthData }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">État de santé</h1>
        <p className="text-sm text-muted-foreground">
          {data.periodLabel} · objectif LTV {data.target} € / nouvel abonné
          {data.restricted && ' · périmètre : tes modèles assignés'}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card className="py-4">
          <CardContent className="flex flex-col items-center gap-1 px-8">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {data.restricted ? 'LTV — tes modèles' : 'LTV agence'}
            </span>
            <LtvGauge ltv={data.ltv} status={data.status} target={data.target} size="lg" />
            <StatusBadge status={data.status} />
          </CardContent>
        </Card>
        <KpiGrid kpis={data.kpis} />
      </div>

      {data.plan && (
        <Card className="border-blue-200 bg-blue-50/50 py-3 dark:border-blue-900 dark:bg-blue-950/30">
          <CardContent className="flex flex-col gap-1.5 px-4 text-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>
                <b>Manque à gagner vs objectif LTV {data.target} € :</b>{' '}
                <b>{eur(data.plan.missing)}</b>{' '}
                <span className="text-muted-foreground">
                  (à rattraper : ≈ {num(data.plan.perDay)} €/j sur les {data.plan.remainingDays} j
                  restants du mois)
                </span>
              </span>
            </div>
            <p className="pl-6 text-xs leading-relaxed text-muted-foreground">
              Comment c&apos;est calculé : les {num(data.plan.subs)} nouveaux abonnés de la période
              auraient rapporté {eur(data.plan.objective)} s&apos;ils valaient {data.target} €
              chacun (l&apos;objectif) ; ils ont rapporté {eur(data.plan.realized)}. C&apos;est un
              manque à gagner vs la cible, pas une perte — et l&apos;objectif remonte à chaque
              nouvel abonné gagné.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Répartition par modèle
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.models.map((m) => (
            <ModelHealthCard key={m.id} model={m} target={data.target} />
          ))}
        </div>
      </div>

      {data.excludedModels.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Hors LTV
            </h2>
            <p className="text-xs text-muted-foreground">
              Pas pris en compte dans la LTV agence (exclus via la page Quotas) — affichés parce
              qu&apos;ils ont des données sur la période.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.excludedModels.map((m) => (
              <ModelHealthCard key={m.id} model={m} target={data.target} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
