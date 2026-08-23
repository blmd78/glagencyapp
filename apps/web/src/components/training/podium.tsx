import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export interface PodiumRow {
  profileId: string
  displayName: string
  points: number
}

/** Hauteurs des marches (GLA : 46 / 64 / 34 px) — la 1re domine, la 3e est la plus basse. */
const BAR_HEIGHT: Record<number, string> = { 1: 'h-16', 2: 'h-12', 3: 'h-9' }

/**
 * Podium à trois marches — 2e à gauche, 1er au centre avec sa couronne, 3e à droite. Transposé de
 * `paintHomePodium` de l'app Good Luck Agency : un tableau de trois lignes dit la même chose, un
 * podium la fait ressentir.
 *
 * Partagé (`components/`) : le classement général de « Ma formation » et le classement d'un module
 * l'affichent tous les deux, et une feature ne peut pas importer une autre feature (frontière
 * ESLint). Il ne reçoit QUE des lignes déjà triées et filtrées — il ne connaît ni scope, ni RPC.
 */
export function Podium({ rows, myProfileId }: { rows: PodiumRow[]; myProfileId: string }) {
  const [first, second, third] = rows
  return (
    // `items-end` : les marches sont alignées par le bas, c'est leur hauteur qui parle.
    <ol className="flex min-h-[128px] items-end justify-center gap-2">
      <Step row={second} place={2} me={second?.profileId === myProfileId} />
      <Step row={first} place={1} me={first?.profileId === myProfileId} />
      <Step row={third} place={3} me={third?.profileId === myProfileId} />
    </ol>
  )
}

function Step({ row, place, me }: { row: PodiumRow | undefined; place: number; me: boolean }) {
  // Marche vide (moins de 3 classés) : on garde la colonne pour ne pas décentrer le 1er.
  if (!row) return <li className="min-w-0 flex-1" aria-hidden />
  const first = place === 1
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center">
      <Avatar className={cn('mb-1.5', first ? 'size-13 ring-2 ring-gold' : 'size-11 ring-1 ring-border')}>
        <AvatarFallback className={cn('font-bold', first ? 'bg-gold-soft text-xl' : 'text-sm')}>
          {first ? <span aria-hidden>👑</span> : row.displayName.trim().charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className={cn('w-full rounded-t-lg bg-gradient-to-b from-xp/40 to-xp/5', BAR_HEIGHT[place])} />
      <p className={cn('mt-1.5 w-full truncate text-center text-xs font-bold uppercase', me && 'text-xp')}>
        {row.displayName}
        {me && ' (toi)'}
      </p>
      <p className="text-xs font-semibold tabular-nums text-muted-foreground">{row.points.toLocaleString('fr-FR')}</p>
      <span className="sr-only">{place}e place</span>
    </li>
  )
}
