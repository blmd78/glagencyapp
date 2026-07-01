import { ChattersTable } from './components/chatters-table'
import type { ChattersData } from './types'

/** Template Chatteurs : compose la table à partir des données reçues. Aucun fetch. */
export function ChattersTemplate({ data }: { data: ChattersData }) {
  const totalCa = data.chatters.reduce((sum, c) => sum + c.ca, 0)
  const active = data.chatters.filter((c) => c.active).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chatteurs</h1>
        <p className="text-sm text-muted-foreground">
          {data.period} · {data.chatters.length} chatteurs ({active} actifs) · CA
          total {totalCa.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
        </p>
      </div>
      <ChattersTable chatters={data.chatters} />
    </div>
  )
}
