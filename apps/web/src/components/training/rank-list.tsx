import { cn } from '@/lib/utils'

export interface RankListRow {
  profileId: string
  displayName: string
  points: number
  casesDone: number
  avgTotal: number | null
}

/** Médaille des trois premiers, numéro ensuite (GLA `rankMedal`). */
const MEDAL = ['🥇', '🥈', '🥉']

/** Pastille de l'avatar : or, argent, bronze, puis neutre (GLA `rankAv`). */
const AVATAR_BG = ['#ffb02e', '#c9ced9', '#cd7f32']

/**
 * Le classement en liste — transposition de `rankRow` de l'app Good Luck Agency, où trois repères
 * se superposent pour qu'on se situe d'un coup d'œil :
 *
 *  - les TROIS PREMIERS sortent du lot : médaille, avatar or / argent / bronze, fond plus clair ;
 *  - MA LIGNE est en vert, cerclée d'un liseré — on la retrouve sans lire les noms ;
 *  - la MOYENNE est au feu tricolore (≥ 80 vert, ≥ 60 orange, sinon rouge).
 *
 * Partagé (`components/`) : le classement général de « Ma formation » et celui d'un module
 * l'affichent tous les deux, et une feature ne peut pas en importer une autre (frontière ESLint).
 * Il reçoit des lignes DÉJÀ triées — il ne connaît ni scope, ni RPC.
 */
export function RankList({ rows, myProfileId }: { rows: RankListRow[]; myProfileId: string }) {
  if (rows.length === 0) {
    return (
      <div className="px-2 py-5 text-center">
        <div aria-hidden className="text-[32px] opacity-45">🏆</div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--gla-muted)]">
          Personne n’a encore marqué de points.
          <br />
          <b className="text-[var(--gla-accent)]">Sois le premier 🔥</b>
        </p>
      </div>
    )
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((r, i) => {
        const me = r.profileId === myProfileId
        const top = i < 3
        return (
          <li
            key={r.profileId}
            className={cn(
              'flex items-center gap-2.5 rounded-xl px-2.5 py-2',
              me
                ? 'bg-[var(--gla-accent-soft)] shadow-[inset_0_0_0_1.5px_var(--gla-accent)]'
                : top && 'bg-[var(--gla-surface2)]',
            )}
          >
            <span className="w-[18px] text-center" aria-hidden>
              {MEDAL[i] ?? <span className="text-xs font-bold text-[var(--gla-faint)]">{i + 1}</span>}
            </span>
            <span
              aria-hidden
              className="inline-flex size-7 flex-none items-center justify-center rounded-full text-xs font-extrabold"
              style={{
                background: AVATAR_BG[i] ?? 'var(--gla-surface3)',
                color: top ? '#1a1204' : 'var(--gla-text)',
              }}
            >
              {r.displayName.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <span className={cn('min-w-0 flex-1 truncate text-[13px]', me ? 'font-extrabold' : 'font-semibold')}>
              {r.displayName}
              {me && <span className="font-bold text-[var(--gla-accent)]"> · toi</span>}
            </span>
            <span className="hidden text-xs tabular-nums text-[var(--gla-faint)] sm:inline">{r.casesDone} cas</span>
            <span className="w-9 text-right text-[13px] font-bold tabular-nums" style={{ color: avgColor(r.avgTotal) }}>
              {r.avgTotal == null ? '—' : Math.round(r.avgTotal)}
            </span>
            <span className="w-14 text-right text-sm font-extrabold tabular-nums text-[var(--gla-accent)]">
              {r.points.toLocaleString('fr-FR')}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Feu tricolore de la moyenne (GLA `rankCol`) — seuils et couleurs repris tels quels. */
function avgColor(avg: number | null): string {
  if (avg == null) return 'var(--gla-faint)'
  if (avg >= 80) return '#31d39a'
  if (avg >= 60) return '#ffb02e'
  return '#ff6b6f'
}
