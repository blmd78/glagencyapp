'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Info, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur, num, pct } from '@/lib/format'
import { setInsightState } from '../actions'
import type { DailyCa } from '@glagency/core'
import type { InsightRow, InsightStatus } from '../types'

const SEVERITY = {
  critical: { label: 'Critique', className: STATUS_COLORS.danger, border: 'border-l-red-500' },
  warning: { label: 'Moyen', className: STATUS_COLORS.warning, border: 'border-l-amber-500' },
  ok: { label: 'Sain', className: STATUS_COLORS.positive, border: 'border-l-green-500' },
} as const

const STATUS_LABELS: Record<InsightStatus, string> = {
  new: 'Nouveau',
  in_progress: 'En cours',
  resolved: 'Résolu',
  ignored: 'Ignoré',
}
const STATUS_STYLE: Record<InsightStatus, string> = {
  new: STATUS_COLORS.info,
  in_progress: STATUS_COLORS.warning,
  resolved: STATUS_COLORS.positive,
  ignored: STATUS_COLORS.neutral,
}

const frDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

const isoAddDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Complète une semaine (lundi `start` → +6 j) avec les jours à 0 € manquants — la
 * ventilation ne stocke que les jours avec des ventes, mais on veut TOUT voir, daté.
 * `cap` (exclu) borne la semaine en cours aux jours déjà ingérés.
 */
function fillWeek(start: string, dailies: DailyCa[], cap?: string): DailyCa[] {
  const byDate = new Map(dailies.map((d) => [d.date, d.ca]))
  const out: DailyCa[] = []
  for (let i = 0; i < 7; i++) {
    const date = isoAddDays(start, i)
    if (cap && date >= cap) break
    out.push({ date, ca: byDate.get(date) ?? 0 })
  }
  return out
}

/** Liste jour par jour du CA (contenu du survol « détail »), zéros grisés. */
function DailyList({ title, dailies }: { title: string; dailies: DailyCa[] }) {
  if (!dailies.length) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{title}</span>
      {dailies.map((d) => (
        <span key={d.date} className={cn('tabular-nums', d.ca === 0 && 'text-muted-foreground')}>
          {frDay(d.date)} — {eur(d.ca)}
        </span>
      ))}
    </div>
  )
}

/** Carte insight « quotas hebdo » : chips, split modèles S-1/semaine en cours, plan, statuts. */
export function InsightCard({ insight }: { insight: InsightRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState(insight.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const sev = SEVERITY[insight.severity]

  const apply = (status: InsightStatus) => {
    setError(null)
    startTransition(async () => {
      const res = await setInsightState({ key: insight.key, status, note: note.trim() || null })
      if (!res.success) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <Card className={cn('border-l-4 py-0', sev.border)}>
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90 [[data-state=open]>&]:rotate-90" />
          <Badge className={cn('shrink-0 text-xs uppercase', sev.className)}>{sev.label}</Badge>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{insight.title}</span>
          {/* 5 pastilles quotas : vert = atteint, rouge = manqué. */}
          <span className="hidden shrink-0 gap-1 sm:flex" aria-hidden>
            {insight.kpis.map((k) => (
              <span
                key={k.label}
                title={`${k.label} : ${k.value} (cible ${k.target})`}
                className={cn('size-2 rounded-full', k.ok ? 'bg-green-500' : 'bg-red-500')}
              />
            ))}
          </span>
          <Badge className={cn('shrink-0 text-xs', STATUS_STYLE[insight.status])}>
            {STATUS_LABELS[insight.status]}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
      <CardContent className="flex flex-col gap-3 px-4 pb-4">
        <p className="whitespace-pre-line text-sm text-muted-foreground">{insight.body}</p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {insight.kpis.map((k) => (
            <div
              key={k.label}
              className={cn(
                'rounded-md border px-2.5 py-1.5',
                k.ok
                  ? 'border-green-200 dark:border-green-900'
                  : 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30',
              )}
            >
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {k.label}
              </div>
              <div
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  k.ok ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300',
                )}
              >
                {k.value}
              </div>
              <div className="text-[10px] tabular-nums text-muted-foreground">cible {k.target}</div>
            </div>
          ))}
        </div>

        {insight.models.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md bg-muted/40 p-2.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {insight.models.length > 1 ? 'Split par modèle (prorata)' : 'CA par modèle'}
            </span>
            {insight.models.map((m) => (
              <div key={m.name} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <Badge className={modelColor(m.name)}>{m.name}</Badge>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Détail CA/jour — ${m.name}`}
                        className="self-center text-muted-foreground/60 transition-colors hover:text-foreground"
                      >
                        <Info className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="flex gap-4 text-xs font-normal">
                      {Array.isArray(m.dailies) ? (
                        <>
                          <DailyList title="S-1" dailies={fillWeek(insight.weekStart, m.dailies)} />
                          <DailyList
                            title="En cours"
                            dailies={fillWeek(
                              isoAddDays(insight.weekStart, 7),
                              m.weekDailies ?? [],
                              new Date().toISOString().slice(0, 10),
                            )}
                          />
                        </>
                      ) : (
                        // Génération antérieure à l'ajout du détail : ne pas fabriquer de faux 0.
                        <span>Détail indisponible pour cette génération.</span>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="tabular-nums">
                  S-1 : {eur(m.ca)} / {eur(m.expected)} attendus · {num(m.days)} j ·{' '}
                  <b>{eur(m.days > 0 ? m.ca / m.days : 0)}/j</b>
                  {m.days > 0 && m.expected > 0 && ` (cible ${eur(m.expected / m.days)}/j)`} —{' '}
                  <b
                    className={
                      m.pct >= 100
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }
                  >
                    {pct(m.pct)}
                  </b>
                </span>
                {m.weekDays > 0 && (
                  <span className="tabular-nums text-muted-foreground">
                    · en cours : {eur(m.weekCa)} ({num(m.weekDays)} j · {eur(m.weekCa / m.weekDays)}/j)
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {insight.actionPlan.trim() !== '' && (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
            Plan d&apos;action — management
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="mt-2 whitespace-pre-line rounded-md border-l-2 border-amber-500 bg-muted/40 p-3 text-xs leading-relaxed">
              {insight.actionPlan}
            </p>
          </CollapsibleContent>
        </Collapsible>
        )}

        <div className="flex flex-col gap-2 border-t pt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (action prise, contexte…)"
            rows={1}
            className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
          />
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_LABELS) as InsightStatus[]).map((s) => (
              <Button
                key={s}
                variant={insight.status === s ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                disabled={pending}
                onClick={() => apply(s)}
              >
                {pending ? <Loader2 className="size-3 animate-spin" /> : null}
                {STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
