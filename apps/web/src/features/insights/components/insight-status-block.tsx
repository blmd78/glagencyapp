'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STATUS_COLORS } from '@/lib/status-color'
import type { InsightRow, InsightStatus } from '../types'

export const STATUS_LABELS: Record<InsightStatus, string> = {
  new: 'Nouveau',
  in_progress: 'En cours',
  resolved: 'Résolu',
  ignored: 'Ignoré',
}
export const STATUS_STYLE: Record<InsightStatus, string> = {
  new: STATUS_COLORS.info,
  in_progress: STATUS_COLORS.warning,
  resolved: STATUS_COLORS.positive,
  ignored: STATUS_COLORS.neutral,
}

const frDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/**
 * Note + boutons de statut d'une carte insight — extrait de `insight-card.tsx` (split >
 * 300 lignes, `docs/guidelines-standard-feature.md` §1). DOM identique à l'ancien
 * `statusBlock` inline ; toute la logique (verrous, optimiste, erreur) reste dans
 * `InsightCard`, ce composant ne fait que le rendu à partir des props.
 */
export function InsightStatusBlock({
  insight,
  status,
  isAdmin,
  takenByOther,
  note,
  onNoteChange,
  pending,
  clicked,
  onApply,
  onReset,
  error,
}: {
  insight: InsightRow
  status: InsightStatus
  isAdmin: boolean
  takenByOther: boolean
  note: string
  onNoteChange: (value: string) => void
  pending: boolean
  clicked: InsightStatus | null
  onApply: (next: InsightStatus) => void
  onReset: () => void
  error: string | null
}) {
  return (
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
        onChange={(e) => onNoteChange(e.target.value)}
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
              onClick={() => onApply(st)}
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
            onClick={onReset}
          >
            {clicked === 'new' ? <Loader2 className="size-3 animate-spin" /> : null}
            Réinitialiser
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
