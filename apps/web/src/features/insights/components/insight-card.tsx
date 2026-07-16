'use client'

import { useEffect, useState, useTransition } from 'react'
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
import { BilanDialog, ETAT_OPTIONS } from './bilan-dialog'
import { addDays as isoAddDays, frWeekdayShort } from '@glagency/core'
import type { DailyCa } from '@glagency/core'
import type { InsightBilan, InsightRow, InsightStatus } from '../types'

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
          {frWeekdayShort(d.date)} — {eur(d.ca)}
        </span>
      ))}
    </div>
  )
}

/** Plan d'action rendu en sections structurées ([CA], [PRÉSENCE]…) au lieu d'un bloc de texte. */
function PlanSections({ plan }: { plan: string }) {
  const sections = plan.split('\n\n').filter(Boolean)
  return (
    <div className="mt-2 flex flex-col gap-2">
      {sections.map((sec, i) => {
        const lines = sec.split('\n')
        const m = (lines[0] ?? '').match(/^\[([^\]]+)\]\s*(.*)$/)
        const title = m?.[1] ?? ''
        const intro = m ? m[2] : (lines[0] ?? '')
        return (
          <div key={i} className="rounded-md border-l-2 border-red-400 bg-muted/40 p-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              {title && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
                  {title}
                </span>
              )}
              <span className="text-xs font-medium">{intro}</span>
            </div>
            <ul className="mt-1.5 flex flex-col gap-1 text-xs leading-relaxed">
              {lines.slice(1).map((l, j) =>
                l.startsWith('- ') ? (
                  <li key={j} className="flex gap-1.5">
                    <span className="text-muted-foreground">•</span>
                    <span>{l.slice(2)}</span>
                  </li>
                ) : (
                  <li key={j} className="font-medium">{l}</li>
                ),
              )}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/** Infobulle ⓘ : détail CA jour par jour d'un modèle. */
function DailyInfo({ label, weekStart, dailies }: { label: string; weekStart: string; dailies: DailyCa[] | undefined }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Détail CA/jour — ${label}`}
            className="self-center text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs font-normal">
          {Array.isArray(dailies) ? (
            <DailyList title="Semaine passée (S-1)" dailies={fillWeek(weekStart, dailies)} />
          ) : (
            <span>Détail indisponible pour cette génération.</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Carte insight « quotas hebdo » : chips, split modèles S-1/semaine en cours, plan, statuts. */
export function InsightCard({
  insight,
  isAdmin,
  currentUserId,
}: {
  insight: InsightRow
  isAdmin: boolean
  currentUserId: string
}) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState(insight.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [bilanOpen, setBilanOpen] = useState(false)
  // Optimiste : le badge/bouton changent au clic, le serveur confirme derrière.
  const [localStatus, setLocalStatus] = useState<InsightStatus | null>(null)
  const [clicked, setClicked] = useState<InsightStatus | null>(null)
  const status = localStatus ?? insight.status
  // Carte « prise » : En cours posé par quelqu'un d'autre → lecture seule (sauf admin).
  const takenByOther =
    status === 'in_progress' &&
    !isAdmin &&
    insight.updatedBy != null &&
    insight.updatedBy !== currentUserId
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset local au changement de statut ; refactor prévu au batch insights (migration standard-feature)
  useEffect(() => setLocalStatus(null), [insight.status])
  const sev = SEVERITY[insight.severity]

  const resetState = () => {
    setError(null)
    setClicked('new')
    const previous = { status, note }
    setLocalStatus('new')
    setNote('')
    startTransition(async () => {
      const res = await setInsightState({ key: insight.key, status: 'new', note: null, reset: true })
      setClicked(null)
      if (!res.success) {
        setLocalStatus(previous.status)
        setNote(previous.note)
        setError(res.error)
      }
    })
  }

  const apply = (next: InsightStatus, bilan?: InsightBilan) => {
    // « Résolu » passe obligatoirement par le modal bilan (garde aussi côté serveur).
    if (next === 'resolved' && !bilan) {
      setBilanOpen(true)
      return
    }
    setError(null)
    setClicked(next)
    const previous = status
    setLocalStatus(next)
    startTransition(async () => {
      const res = await setInsightState({
        key: insight.key,
        status: next,
        note: note.trim() || null,
        ...(bilan ? { bilan } : {}),
      })
      setClicked(null)
      if (!res.success) {
        setLocalStatus(previous) // rollback optimiste
        setError(res.error)
        return
      }
      setBilanOpen(false)
      // Pas de router.refresh() : revalidatePath dans l'action renvoie déjà l'UI fraîche.
    })
  }

  // Note + boutons de statut : placés EN FIN de plan d'action quand il y en a un
  // (obligation de dérouler le plan avant de statuer) ; en bas de carte sinon (cartes saines).
  const frDateTime = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  const statusBlock = (
        <div className="flex flex-col gap-2 border-t pt-3">
          {insight.updatedBy && status !== 'new' && (
            <span className="text-[11px] text-muted-foreground">
              {STATUS_LABELS[status]} · par <b>{insight.updatedByName}</b>
              {insight.updatedAt ? ` · ${frDateTime(insight.updatedAt)}` : ''}
              {takenByOther && ' — seul lui (ou un admin) peut modifier'}
            </span>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (action prise, contexte…)"
            rows={1}
            className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending || takenByOther}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {/* « Nouveau » est l'état de départ, pas une action → 3 boutons + reset. */}
            {(['in_progress', 'resolved', 'ignored'] as InsightStatus[]).map((st) => {
              // Sortir de « Ignoré » : admin uniquement (le serveur l'impose aussi).
              const locked = (status === 'ignored' && st !== 'ignored' && !isAdmin) || takenByOther
              return (
                <Button
                  key={st}
                  variant={status === st ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs"
                  disabled={pending || locked}
                  title={locked ? 'Réservé aux admins' : undefined}
                  onClick={() => apply(st)}
                >
                  {clicked === st ? <Loader2 className="size-3 animate-spin" /> : null}
                  {STATUS_LABELS[st]}
                </Button>
              )
            })}
            {status !== 'new' && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                disabled={pending || (status === 'ignored' && !isAdmin) || takenByOther}
                title={
                  takenByOther
                    ? `Pris en charge par ${insight.updatedByName}`
                    : status === 'ignored' && !isAdmin
                      ? 'Réservé aux admins'
                      : 'Remettre à l’état initial'
                }
                onClick={resetState}
              >
                {clicked === 'new' ? <Loader2 className="size-3 animate-spin" /> : null}
                Réinitialiser
              </Button>
            )}
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
  )

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
          <Badge className={cn('shrink-0 text-xs', STATUS_STYLE[status])}>
            {STATUS_LABELS[status]}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
      <CardContent className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-4 lg:items-start lg:gap-4">
        {/* ── Colonne gauche (3/4) : l'analyse S-1 ── */}
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-3">
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
                <DailyInfo label={m.name} weekStart={insight.weekStart} dailies={m.dailies} />
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
            <PlanSections plan={insight.actionPlan} />
            <div className="mt-3">{statusBlock}</div>
          </CollapsibleContent>
        </Collapsible>
        )}
        </div>

        {/* ── Colonne droite (1/4) : suivi de la semaine en cours, côte à côte ── */}
        {insight.week && (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 lg:col-span-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Semaine en cours
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">{insight.week.label}</span>
            <Badge
              className={cn(
                'w-fit text-xs',
                insight.week.days === 0 && !insight.week.struggling
                  ? STATUS_COLORS.neutral
                  : insight.week.struggling
                    ? STATUS_COLORS.danger
                    : STATUS_COLORS.positive,
              )}
            >
              {insight.week.days === 0 && !insight.week.struggling
                ? 'En attente de données'
                : insight.week.struggling
                  ? 'En difficulté'
                  : 'Dans la cible'}
            </Badge>
            <span className="text-xl font-semibold tabular-nums">{eur(insight.week.ca)}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {eur(insight.week.perDay)}/j · j{num(insight.week.days)}/7
            </span>
            {insight.week.deltaPct != null && (
              <span
                className={cn(
                  'text-xs font-semibold tabular-nums',
                  insight.week.deltaPct > 10
                    ? 'text-green-600 dark:text-green-400'
                    : insight.week.deltaPct < -10
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-amber-600 dark:text-amber-400',
                )}
              >
                {insight.week.deltaPct > 10 ? '↗' : insight.week.deltaPct < -10 ? '↘' : '→'}{' '}
                {insight.week.deltaPct > 0 ? '+' : ''}
                {insight.week.deltaPct} % vs S-1
              </span>
            )}
            {insight.models.some((m) => m.weekDays > 0) && (
              <div className="flex flex-col gap-1 border-t pt-2 text-xs tabular-nums text-muted-foreground">
                {insight.models
                  .filter((m) => m.weekDays > 0)
                  .map((m) => (
                    <span key={m.name}>
                      {m.name} : {eur(m.weekCa)} ({num(m.weekDays)} j)
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}
        </div>

        {insight.bilan && status !== 'new' && (
          <div className="flex flex-col gap-1 rounded-md border-l-2 border-green-500 bg-muted/40 p-2.5 text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
              Bilan du {frWeekdayShort(insight.bilan.date)} · {insight.bilan.duree} ·{' '}
              {ETAT_OPTIONS.find(([v]) => v === insight.bilan?.etat)?.[1] ?? insight.bilan.etat}
            </span>
            <p className="whitespace-pre-line">{insight.bilan.resume}</p>
            {insight.bilan.actions && <p><b>Actions :</b> {insight.bilan.actions}</p>}
            {insight.bilan.objectifs && <p><b>Objectifs :</b> {insight.bilan.objectifs}</p>}
            {insight.bilan.sanction && <p><b>Sanction si non tenu :</b> {insight.bilan.sanction}</p>}
            {insight.bilan.nextCheck && <p><b>Prochain checkpoint :</b> {frWeekdayShort(insight.bilan.nextCheck)}</p>}
            {insight.bilan.notes && <p className="text-muted-foreground">{insight.bilan.notes}</p>}
          </div>
        )}

        {bilanOpen && (
          <BilanDialog
            open={bilanOpen}
            onOpenChange={setBilanOpen}
            title={insight.title}
            initial={insight.bilan}
            pending={pending}
            onSave={(b) => apply('resolved', b)}
          />
        )}

        {insight.actionPlan.trim() === '' && statusBlock}
      </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
