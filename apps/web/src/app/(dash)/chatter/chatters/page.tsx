import { Suspense } from 'react'
import { getChatters } from '@/lib/services/get-chatters'
import { requireAccess } from '@/lib/auth'
import { ChattersTemplate } from '@/features/chatters/ChattersTemplate'
import { resolvePeriod } from '@/lib/period'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { ChattersData } from '@/lib/types/chatters'

export default async function ChattersPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('chatters')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await (pattern streaming, spec §2.3) : le shell (h1) s'affiche
  // immédiatement, la table streame dans son boundary quand le RPC répond.
  const data = getChatters(period, { restricted: profile.role !== 'admin' })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Chatteurs</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <ChattersContent data={data} />
      </Suspense>
    </div>
  )
}

async function ChattersContent({ data }: { data: Promise<ChattersData> }) {
  return <ChattersTemplate data={await data} />
}
