import Link from 'next/link'
import type { Route } from 'next'
import { SLOT_LABEL, fmtDuration } from '@glagency/core'
import { int } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import type { ReportRow, SlotActivity } from '../types'

/**
 * Une personne sur la période.
 *
 * Le verdict porte sur SON créneau et sur lui seul (décision D7 de la spec). Les autres créneaux
 * sont du renfort : affichés parce qu'ils expliquent le temps de travail, jamais comptés comme
 * un écart. Sans cette séparation, l'écran affichait « sous le seuil » sur des gens qui
 * dépannaient — mesuré en production le 2026-09-04 : 262 lignes de renfort à 16 % de couverture
 * moyenne, contre 183 lignes réellement jugeables.
 *
 * PAS de dépliage jour par jour ici : sur un mois ce serait plusieurs milliers de lignes de DOM,
 * pour un détail qui appartient à la fiche de la personne. La ligne y mène.
 */
export function ChatterRow({
  row,
  threshold,
  canReport,
}: {
  row: ReportRow
  threshold: number
  /** Le lien de signalement est-il proposé ? (droit Police + période dans la fenêtre de 14 j) */
  canReport: boolean
}) {
  const missed = row.expected ? row.expected.days - row.expected.held : 0
  const heldPct =
    row.expected && row.expected.days > 0
      ? Math.round((row.expected.held / row.expected.days) * 100)
      : 0

  return (
    <div className="grid grid-cols-[0.5rem_1fr] items-start gap-3 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[0.5rem_minmax(9rem,1fr)_minmax(11rem,1.6fr)_5rem_5rem]">
      {/* Pastille d'état. GRISE pour qui n'a pas de créneau attendu : ni vert ni rouge, parce
          qu'il n'y a rien à juger — et une pastille rouge par défaut serait une accusation. */}
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-2 rounded-full',
          !row.expected ? 'bg-muted-foreground/40' : missed > 0 ? 'bg-red-500' : 'bg-emerald-500',
        )}
      />

      <span className="min-w-0">
        {row.profileId ? (
          <Link
            href={`/chatter/presence/${row.profileId}` as Route}
            className="block truncate font-medium underline-offset-4 hover:underline"
          >
            {row.name}
          </Link>
        ) : (
          <span className="block truncate font-medium">{row.name}</span>
        )}
        <span className="block truncate text-xs text-muted-foreground">
          {row.memberShift ? SLOT_LABEL[row.memberShift] : 'aucun créneau attendu'} ·{' '}
          {row.daysWorked} jour{row.daysWorked > 1 ? 's' : ''} travaillé
          {row.daysWorked > 1 ? 's' : ''}
        </span>
      </span>

      {/* Le verdict : jours TENUS sur jours attendus. Un compte, jamais une moyenne de
          pourcentages — moyenner des verdicts MyPuls donnerait un chiffre invérifiable. */}
      <span className="min-w-0">
        {row.expected ? (
          <>
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  'block h-full rounded-full',
                  missed > 0 ? 'bg-red-500' : 'bg-emerald-500',
                )}
                style={{ width: `${heldPct}%` }}
              />
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground tabular-nums">
              {row.expected.held}/{row.expected.days} jour{row.expected.days > 1 ? 's' : ''} tenu
              {row.expected.held > 1 ? 's' : ''} à {threshold} %
              {missed > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  {' · '}manque {missed} jour{missed > 1 ? 's' : ''}
                </span>
              )}
            </span>
          </>
        ) : (
          <span className="block text-xs text-muted-foreground">
            {row.memberShift
              ? `aucune activité sur son créneau (${SLOT_LABEL[row.memberShift]})`
              : 'non jugeable — aucun créneau attendu n’est renseigné'}
          </span>
        )}

        {row.other.length > 0 && <Renfort slots={row.other} />}

        {row.models.length > 0 && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {row.models.slice(0, 4).map((m) => (
              <Badge key={m} className={modelColor(m)}>
                {m}
              </Badge>
            ))}
            {row.models.length > 4 && (
              <span className="text-xs text-muted-foreground">+{row.models.length - 4}</span>
            )}
          </span>
        )}

        {canReport && missed > 0 && row.profileId && (
          // Mène à la FICHE, pas au dialog Police : une sanction se DATE, et la date se choisit
          // devant l'historique jour par jour. Proposer « Signaler » depuis une période
          // obligerait à deviner lequel des jours manqués on vise.
          <Link
            href={`/chatter/presence/${row.profileId}` as Route}
            className="mt-1.5 block text-xs text-red-700 underline-offset-4 hover:underline dark:text-red-400"
          >
            Voir les jours manqués et signaler →
          </Link>
        )}
      </span>

      <span className="hidden text-right text-sm tabular-nums sm:block">
        {fmtDuration(row.activeMinutes)}
      </span>

      <span
        className={cn(
          'hidden text-right text-sm tabular-nums sm:block',
          row.expected?.latenessAvg ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
        )}
      >
        {row.expected?.latenessAvg ? fmtDuration(row.expected.latenessAvg) : '—'}
      </span>
    </div>
  )
}

/**
 * Le renfort — les créneaux qui ne sont pas celui de la personne.
 *
 * Affiché en neutre et JAMAIS chiffré contre un seuil : quelqu'un qui envoie trois messages sur
 * un créneau qui n'est pas le sien y a 2 % de couverture, et le compter comme une faute
 * reviendrait à sanctionner le zèle.
 */
function Renfort({ slots }: { slots: SlotActivity[] }) {
  return (
    <span className="mt-1 block text-xs text-muted-foreground">
      <Badge className={`${STATUS_COLORS.neutral} mr-1.5`}>renfort</Badge>
      {slots
        .map(
          (s) =>
            `${SLOT_LABEL[s.slot]} ${s.days} j · ${fmtDuration(s.activeMinutes)} · ${int(s.messages)} msg`,
        )
        .join(' — ')}
    </span>
  )
}
