import Link from 'next/link'
import type { Route } from 'next'
import { Button } from '@/components/ui/button'
import type { MeData } from '../types'

/**
 * En-tête de Ma formation : la reprise d'une session en cours (s'il y en a une), puis les quatre
 * chiffres qui résument l'entraînement, et les trophées gagnés en une ligne.
 */
export function MeHeader({ data }: { data: MeData }) {
  const { stats, active, totalCases, trophies, myRank, ranking } = data
  const earned = trophies.filter((t) => t.earned).length
  const rank = myRank == null ? null : `${myRank === 1 ? '1er' : `${myRank}e`} sur ${ranking.length}`
  return (
    <div className="flex flex-col gap-4">
      {active && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Session en cours — {active.caseTitle}</p>
            {active.moduleTitle && <p className="text-sm text-muted-foreground">{active.moduleTitle}</p>}
          </div>
          {/* `as Route` : typedRoutes n'accepte pas une chaîne interpolée sur un segment dynamique. */}
          <Button asChild size="sm">
            <Link href={`/formation/session/${active.id}` as Route}>Continuer</Link>
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Cas validés" value={`${stats.casesDone}/${totalCases}`} />
        <Figure label="Moyenne" value={stats.avgTotal == null ? '—' : `${Math.round(stats.avgTotal)}/100`} />
        <Figure label="Points" value={String(stats.points)} />
        <Figure label="Série" value={`${stats.streakDays} j`} />
      </div>
      <p className="text-sm text-muted-foreground">
        Trophées gagnés : {earned}/{trophies.length}
        {rank && ` · Classement : ${rank}`}
      </p>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
