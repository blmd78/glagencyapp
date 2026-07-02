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

      {data.chatters.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Aucune donnée chatteur sur cette période</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Le détail par chatteur n'est pour l'instant disponible que pour juin (snapshot) —
            l'ingestion quotidienne par chatteur n'est pas encore active. Sélectionne une période
            couvrant juin pour voir les données.
          </p>
        </div>
      ) : (
        <>
          <RevenueScopeNote active="attributed" />
          <ChattersTable chatters={data.chatters} />
        </>
      )}
    </div>
  )
}
