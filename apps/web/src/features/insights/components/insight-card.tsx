'use client'

import { useState, useTransition } from 'react'
import { ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur, num, pct } from '@/lib/format'
import { setInsightState } from '../actions'
import { BilanDialog, ETAT_OPTIONS } from './bilan-dialog'
import { DailyInfo } from './insight-card-daily'
import { PlanSections } from './insight-plan-sections'
import { InsightStatusBlock, STATUS_LABELS, STATUS_STYLE } from './insight-status-block'
import { InsightWeekColumn } from './insight-week-column'
import { frWeekdayShort } from '@glagency/core'
import type { InsightBilan, InsightRow, InsightStatus } from '../types'

const SEVERITY = {
  critical: { label: 'Critique', className: STATUS_COLORS.danger, border: 'border-l-red-500' },
  warning: { label: 'Moyen', className: STATUS_COLORS.warning, border: 'border-l-amber-500' },
  ok: { label: 'Sain', className: STATUS_COLORS.positive, border: 'border-l-green-500' },
} as const

/** Carte insight « quotas hebdo » : chips, split modèles S-1/semaine en cours, plan, statuts. */
export function InsightCard({
  insight,
  isAdmin,
  canWrite,
  currentUserId,
}: {
  insight: InsightRow
  isAdmin: boolean
  canWrite: boolean
  currentUserId: string
}) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState(insight.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [bilanOpen, setBilanOpen] = useState(false)
  // Optimiste : le badge/bouton changent au clic, le serveur confirme derrière.
  const [localStatus, setLocalStatus] = useState<InsightStatus | null>(null)
  const [clicked, setClicked] = useState<InsightStatus | null>(null)
  // Reset de l'override optimiste AU RENDER (pas un effect) quand le statut serveur change
  // (ex. revalidatePath après mutation) — pattern react.dev « adjusting state during
  // render » : évite le useEffect (et son disable react-hooks/set-state-in-effect posé au
  // batch 0) tout en préservant le même comportement (reset exact au changement de statut).
  const [prevServerStatus, setPrevServerStatus] = useState(insight.status)
  if (insight.status !== prevServerStatus) {
    setPrevServerStatus(insight.status)
    setLocalStatus(null)
  }
  const status = localStatus ?? insight.status
  // Carte « prise » : En cours posé par quelqu'un d'autre → lecture seule (sauf admin).
  const takenByOther =
    status === 'in_progress' &&
    !isAdmin &&
    insight.updatedBy != null &&
    insight.updatedBy !== currentUserId
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
        toast.error(res.error)
        return
      }
      toast.success('Carte réinitialisée')
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
        toast.error(res.error)
        return
      }
      setBilanOpen(false)
      toast.success(`Statut mis à jour : ${STATUS_LABELS[next]}`)
      // Pas de router.refresh() : revalidatePath dans l'action renvoie déjà l'UI fraîche.
    })
  }

  // Note + boutons de statut : placés EN FIN de plan d'action quand il y en a un
  // (obligation de dérouler le plan avant de statuer) ; en bas de carte sinon (cartes saines).
  // Gaté sur `canWrite` : un chatteur (lecture seule) ne voit AUCUN contrôle setInsightState —
  // le reste de la carte (analyse, KPIs, bilan) reste visible (miroir UI de hasWriteAccess).
  const statusBlock = canWrite ? (
    <InsightStatusBlock
      insight={insight}
      status={status}
      isAdmin={isAdmin}
      takenByOther={takenByOther}
      note={note}
      onNoteChange={setNote}
      pending={pending}
      clicked={clicked}
      onApply={apply}
      onReset={resetState}
      error={error}
    />
  ) : null

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
            {statusBlock && <div className="mt-3">{statusBlock}</div>}
          </CollapsibleContent>
        </Collapsible>
        )}
        </div>

        {/* ── Colonne droite (1/4) : suivi de la semaine en cours, côte à côte ── */}
        {insight.week && <InsightWeekColumn week={insight.week} models={insight.models} />}
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
