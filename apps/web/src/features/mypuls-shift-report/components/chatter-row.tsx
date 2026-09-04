import Link from 'next/link'
import type { Route } from 'next'
import { ChevronRight } from 'lucide-react'
import { SLOT_LABEL, fmtDuration } from '@glagency/core'
import { int, pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import type { ReportRow } from '../types'

// Formateurs HOISTÉS : en construire un par cellule est ~70× plus lent (mesuré dans ce repo).
const HHMM = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const clock = (ms: number) => HHMM.format(new Date(ms))
const clockIso = (iso: string | null) => (iso ? HHMM.format(new Date(iso)) : '—')

/**
 * Une ligne de chatteur, sur la grammaire de l'ancien board (.tracker-ref/board.html,
 * `details.item > summary.row`) :
 *
 *   pastille · nom · barre + « 6h32 / 8h00 · manque 1h28 » · Actif · Retard · chevron
 *
 * Deux transpositions, et une seule perte. La barre montrait « minutes sur MyPuls / minimum » ;
 * elle montre ici la COUVERTURE du créneau, qui est la mesure équivalente et celle que MyPuls
 * calcule lui-même. Le dépliage montrait « Sites & apps » puis la timeline : les sites venaient
 * de l'agent posé sur le poste et n'ont aucun équivalent — restent les vacations, qui SONT la
 * timeline.
 */
export function ChatterRow({
  row,
  threshold,
  showSlot,
}: {
  row: ReportRow
  threshold: number
  /** Journée complète : le créneau n'est plus implicite, on le nomme sur la ligne. */
  showSlot: boolean
}) {
  const name = row.memberName ?? row.chatterLabel

  return (
    <details className="group border-b last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[0.5rem_1fr_1rem] items-center gap-3 px-4 py-2.5 hover:bg-muted/40 sm:grid-cols-[0.5rem_minmax(8rem,1fr)_minmax(12rem,2fr)_5rem_5rem_1rem] [&::-webkit-details-marker]:hidden">
        {/* Pastille d'état — le `span.dot` de l'ancien board. */}
        <span
          aria-hidden
          className={cn(
            'size-2 rounded-full',
            row.held ? 'bg-emerald-500' : 'bg-red-500',
          )}
        />

        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium">{name}</span>
            {showSlot && (
              <Badge variant="outline" className="shrink-0 text-[0.65rem] font-normal">
                {SLOT_LABEL[row.slot]}
              </Badge>
            )}
          </span>
          {/* « Renfort » ne se dit que si on CONNAÎT son créneau et qu'il diffère. Sans shift
              renseigné on ne sait pas : le dire serait une affirmation gratuite. */}
          {!row.isExpected && (
            <span className="block truncate text-xs text-muted-foreground">
              {row.memberShift
                ? `renfort · son créneau : ${SLOT_LABEL[row.memberShift]}`
                : row.profileId
                  ? 'shift non renseigné'
                  : 'non rattaché au CRM'}
            </span>
          )}
        </span>

        {/* Barre + libellé : « 6h32 / 8h00 · manque 1h28 ». */}
        <span className="min-w-0">
          <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <span
              className={cn('block h-full rounded-full', row.held ? 'bg-emerald-500' : 'bg-red-500')}
              style={{ width: `${Math.min(100, row.coveragePct)}%` }}
            />
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground tabular-nums">
            {fmtDuration(row.activeMinutes)} / {fmtDuration(row.slotMinutes)} · {pct(row.coveragePct)}
            {row.missingMinutes > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {' · '}manque {fmtDuration(row.missingMinutes)} pour {threshold} %
              </span>
            )}
          </span>
        </span>

        <span className="hidden text-right tabular-nums sm:block">{fmtDuration(row.activeMinutes)}</span>

        <span
          className={cn(
            'hidden text-right tabular-nums sm:block',
            row.latenessMinutes ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
          )}
        >
          {row.latenessMinutes ? fmtDuration(row.latenessMinutes) : '—'}
        </span>

        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>

      <RowDetail row={row} name={name} />
    </details>
  )
}

/** Le dépliage : les chiffres du créneau, les modèles observés, et la timeline des vacations. */
function RowDetail({ row, name }: { row: ReportRow; name: string }) {
  return (
    <div className="flex flex-col gap-4 border-t bg-muted/20 px-4 py-4">
      <div className="flex flex-wrap gap-6">
        <Stat label="Actif" value={fmtDuration(row.activeMinutes)} />
        <Stat label="Messages" value={int(row.messages)} />
        <Stat label="Couverture" value={pct(row.coveragePct)} />
        <Stat label="Première activité" value={clockIso(row.firstAt)} />
        <Stat label="Dernière activité" value={clockIso(row.lastAt)} />
        <Stat
          label="Verdict"
          value={row.held ? 'Poste tenu' : 'Sous le seuil'}
          tone={row.held ? 'positive' : 'warning'}
        />
      </div>

      {row.models.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Modèles observés</span>
          {row.models.map((m) => (
            <Badge key={m} className={modelColor(m)}>
              {m}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">
          Sessions de travail ({row.vacations.length})
        </span>
        {row.vacations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune session sur ce créneau.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {row.vacations.map((v) => (
              <li
                key={v.startedAtMs}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm"
              >
                <span className="tabular-nums">
                  {clock(v.startedAtMs)} → {clock(v.endedAtMs)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {fmtDuration(v.activeMinutes)} actives · {int(v.messages)} msg
                </span>
                <span className="text-xs text-muted-foreground">
                  {v.models.map((m) => `${m.label} (${int(m.messages)})`).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {row.profileId && (
        <Link
          href={`/chatter/presence/${row.profileId}` as Route}
          className="self-start text-sm underline-offset-4 hover:underline"
        >
          Fiche d’activité de {name} →
        </Link>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'warning'
}) {
  return (
    <div className="flex flex-col">
      {tone ? (
        <Badge className={STATUS_COLORS[tone]}>{value}</Badge>
      ) : (
        <span className="font-semibold tabular-nums">{value}</span>
      )}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
