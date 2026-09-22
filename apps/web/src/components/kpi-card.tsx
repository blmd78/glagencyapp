import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HeaderInfo } from '@/components/data-table/header-info'
import { STATUS_COLORS } from '@/lib/status-color'

/** Contrat d'une carte KPI (partagé entre features : overview, health…). */
export interface Kpi {
  key: string
  /** Libellé de la carte, ex. « CA du mois ». */
  label: string
  /** Valeur déjà formatée, ex. « 258 853 € ». */
  value: string
  /** Variation en % vs période précédente (null si non calculée). */
  deltaPct: number | null
  /** Phrase de tendance, ex. « En hausse vs mai ». */
  trendLabel: string
  /** Sous-titre discret, ex. « mai ≈ 244 756 € ». */
  hint: string
  /** Définition/provenance de la métrique — ⓘ au survol à côté du libellé. */
  info?: string
}

/** Une carte KPI : libellé, valeur, badge de tendance et sous-titre. `accent` colore le liseré. */
export function KpiCard({ kpi, accent }: { kpi: Kpi; accent?: string }) {
  const hasDelta = kpi.deltaPct !== null
  const up = (kpi.deltaPct ?? 0) >= 0
  const Trend = up ? TrendingUp : TrendingDown

  return (
    <Card className={cn('gap-2 border-t-4', accent)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardDescription className="flex items-center gap-1.5">
            {kpi.label}
            {kpi.info && <HeaderInfo text={kpi.info} />}
          </CardDescription>
          {hasDelta && (
            <Badge
              className={cn('gap-1 text-xs', up ? STATUS_COLORS.positive : STATUS_COLORS.danger)}
            >
              <Trend className="size-3" />
              {up ? '+' : ''}
              {kpi.deltaPct!.toLocaleString('fr-FR')}%
            </Badge>
          )}
        </div>
        <CardTitle className="text-2xl font-semibold tabular-nums lg:text-3xl">
          {kpi.value}
        </CardTitle>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1 text-sm">
        <div className="flex items-center gap-1 font-medium">
          {kpi.trendLabel}
          {hasDelta && <Trend className="size-4" />}
        </div>
        <div className="text-muted-foreground">{kpi.hint}</div>
      </CardFooter>
    </Card>
  )
}

// Liseré coloré par carte (ordre = ordre des KPIs).
const DEFAULT_ACCENTS = [
  'border-t-blue-500',
  'border-t-emerald-500',
  'border-t-violet-500',
  'border-t-amber-500',
]

// Largeurs autorisées. Classes ÉCRITES EN DUR : Tailwind ne compile pas un nom de classe
// construit à l'exécution (`lg:grid-cols-${n}` ne produirait aucun style).
const GRID_COLS = { 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' } as const

/**
 * Grille responsive de cartes KPI — wrapper partagé (overview, health…).
 * `columns` reste à 4 pour tous les écrans historiques ; l'Overview demande 5 depuis le
 * 2026-09-22 (ses trois cartes de CA + les deux cartes chatteurs tiennent sur une ligne).
 */
export function KpiGrid({
  kpis,
  accents = DEFAULT_ACCENTS,
  columns = 4,
}: {
  kpis: Kpi[]
  accents?: string[]
  columns?: 4 | 5
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', GRID_COLS[columns])}>
      {kpis.map((kpi, i) => (
        <KpiCard key={kpi.key} kpi={kpi} accent={accents[i % accents.length]} />
      ))}
    </div>
  )
}
