import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Insight, InsightSeverity } from '../types'

const SEVERITY: Record<InsightSeverity, { border: string; badge: string }> = {
  critical: {
    border: 'border-l-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  },
  warning: {
    border: 'border-l-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  },
  opportunity: {
    border: 'border-l-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
  insight: {
    border: 'border-l-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  },
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
          <Badge className={cn('shrink-0 border-transparent', sev.badge)}>{insight.category}</Badge>
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
