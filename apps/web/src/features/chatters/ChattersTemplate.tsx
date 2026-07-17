import { ChattersTable } from './components/chatters-table'
import { RevenueScopeNote } from '@/components/revenue-scope-note'
import type { ChattersData } from '@/lib/types/chatters'

/** Template Chatteurs : compose la table à partir des données reçues. Aucun fetch. */
export function ChattersTemplate({ data, canWrite }: { data: ChattersData; canWrite: boolean }) {
  const active = data.chatters.filter((c) => c.active).length

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.period} · {data.chatters.length} chatteurs ({active} actifs)
      </p>

      {data.chatters.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Aucune donnée chatteur sur cette période</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Aucune activité chatteur enregistrée sur la plage sélectionnée. Les données par
            chatteur sont ingérées chaque soir depuis le 30 juin — choisis une période couvrant
            ces jours.
          </p>
        </div>
      ) : (
        <>
          {data.scope && (
            <RevenueScopeNote scope={data.scope} active="attributed" periodLabel={data.period} />
          )}
          <ChattersTable
            chatters={data.chatters}
            dailyRanking={data.dailyRanking}
            canWrite={canWrite}
          />
        </>
      )}
    </div>
  )
}
