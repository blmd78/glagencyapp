export interface PodiumRow {
  profileId: string
  displayName: string
  points: number
}

/** Hauteurs des marches, en px — valeurs GLA (`hts=[46,64,34]`), 1er / 2e / 3e. */
const BAR_HEIGHT: Record<number, number> = { 1: 64, 2: 46, 3: 34 }

/**
 * Podium à trois marches — transposition de `paintHomePodium` (GLA `.apodium`) : 2e à gauche, 1er
 * au centre avec sa couronne cerclée d'or, 3e à droite. Un tableau de trois lignes dit la même
 * chose, un podium la fait ressentir.
 *
 * Partagé (`components/`) : le classement général de « Ma formation » et celui d'un module
 * l'affichent tous les deux, et une feature ne peut pas importer une autre feature (frontière
 * ESLint). Il ne reçoit QUE des lignes déjà triées et filtrées — il ne connaît ni scope, ni RPC.
 */
export function Podium({ rows, myProfileId }: { rows: PodiumRow[]; myProfileId: string }) {
  const [first, second, third] = rows
  return (
    // `items-end` : les marches sont alignées par le bas, c'est leur hauteur qui parle.
    <ol className="mb-3 flex min-h-[120px] items-end justify-center gap-2">
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
    <li className="min-w-0 flex-1 text-center">
      <div
        className={`gla-podium-av mx-auto mb-1.5 grid place-items-center rounded-full font-extrabold ${
          first ? 'gla-podium-av-1 size-[52px] text-xl' : 'size-11 text-sm'
        }`}
        aria-hidden
      >
        {first ? '👑' : row.displayName.trim().charAt(0).toUpperCase()}
      </div>
      <div className="gla-podium-bar w-full" style={{ height: `${BAR_HEIGHT[place] ?? 34}px` }} />
      <p className={`mt-1.5 truncate text-[11px] font-bold ${me ? 'text-[var(--gla-accent)]' : ''}`}>
        {row.displayName}
        {me && ' (toi)'}
      </p>
      <p className="text-[11px] font-bold tabular-nums text-[var(--gla-muted)]">
        {row.points.toLocaleString('fr-FR')}
      </p>
      <span className="sr-only">{place}e place</span>
    </li>
  )
}
