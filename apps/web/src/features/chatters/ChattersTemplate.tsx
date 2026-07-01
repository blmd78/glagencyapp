import { ChattersTable } from './components/chatters-table'
import { RevenueScopeNote } from '@/components/revenue-scope-note'
import type { ChattersData } from './types'

/** Template Chatteurs : compose la table à partir des données reçues. Aucun fetch. */
export function ChattersTemplate({ data }: { data: ChattersData }) {
  const active = data.chatters.filter((c) => c.active).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chatteurs</h1>
        <p className="text-sm text-muted-foreground">
          {data.period} · {data.chatters.length} chatteurs ({active} actifs)
        </p>
      </div>

      <RevenueScopeNote active="attributed" />

      <ChattersTable chatters={data.chatters} />
    </div>
  )
}
