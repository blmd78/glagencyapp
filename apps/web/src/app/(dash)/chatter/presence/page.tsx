import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { BoardTemplate } from '@/features/tracking-board/BoardTemplate'
import { BoardFilters } from '@/features/tracking-board/components/board-filters'
import { BoardSkeleton } from '@/features/tracking-board/components/board-skeleton'
import { getShiftBoard } from '@/features/tracking-board/services/get-shift-board'
import type { BoardData } from '@/features/tracking-board/types'

/**
 * Board du shift — port de `/d/:shift/:date` du tracker GLA.
 *
 * `.trk` porte la palette, `.trk-page` le fond bord à bord (cf. `tracker-theme.css`).
 *
 * La lecture est lancée SANS `await` puis partagée entre deux boundaries : les filtres et le
 * contenu. La barre de titre s'affiche donc immédiatement — c'est elle qui porte le contexte
 * (quel créneau, quel jour) et elle ne doit pas attendre une RPC d'une seconde pour apparaître.
 */
export default async function PresenceBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ shift?: string; date?: string; m?: string }>
}) {
  const profile = await requireAccess('presence')
  const { shift, date, m } = await searchParams

  const data = getShiftBoard({
    callerId: profile.id,
    callerRole: profile.role,
    shiftKey: shift,
    date,
    model: m,
  })

  return (
    <div className="trk trk-page">
      <CtxBar
        title="Chatters"
        crumb={
          <Suspense fallback={null}>
            <Crumb data={data} />
          </Suspense>
        }
      >
        <Suspense fallback={null}>
          <Filters data={data} />
        </Suspense>
      </CtxBar>

      <Suspense fallback={<BoardSkeleton />}>
        <Board data={data} />
      </Suspense>
    </div>
  )
}

async function Crumb({ data }: { data: Promise<BoardData> }) {
  const d = await data
  const day = new Date(`${d.date}T12:00:00Z`)
  const label = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(day)
  return (
    <>
      Shift {d.shiftLabel} · <b>{label}</b>
    </>
  )
}

async function Filters({ data }: { data: Promise<BoardData> }) {
  return <BoardFilters data={await data} />
}

async function Board({ data }: { data: Promise<BoardData> }) {
  return <BoardTemplate data={await data} />
}
