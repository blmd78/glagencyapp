import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/status-color'
import type { Insight, InsightSeverity } from '../types'

const SEVERITY: Record<InsightSeverity, { border: string; badge: string }> = {
  critical: { border: 'border-l-red-500', badge: STATUS_COLORS.danger },
  warning: { border: 'border-l-amber-500', badge: STATUS_COLORS.warning },
  opportunity: { border: 'border-l-green-500', badge: STATUS_COLORS.positive },
  insight: { border: 'border-l-blue-500', badge: STATUS_COLORS.info },
}

/** Un point d'attention : liseré + badge colorés par sévérité, actions repliables. */
export function InsightCard({ insight }: { insight: Insight }) {
  const sev = SEVERITY[insight.severity]

  return (
    <Card className={cn('gap-3 border-l-4', sev.border)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">{insight.icon}</span>
            <h3 className="text-sm font-semibold leading-snug">{insight.title}</h3>
          </div>
          <Badge className={cn('shrink-0', sev.badge)}>{insight.category}</Badge>
        </div>
        {insight.team !== 'all' && (
          <p className="text-xs text-muted-foreground">Équipe {insight.team}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="whitespace-pre-line text-muted-foreground">{insight.body}</p>
        <details className="group">
          <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline">
            Actions recommandées
          </summary>
          <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
            {insight.recommendation}
          </p>
        </details>
      </CardContent>
    </Card>
  )
}
