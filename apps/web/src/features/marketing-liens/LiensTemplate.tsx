import { LiensView } from './components/liens-view'
import type { MktLinksData } from './types'

export function MktLiensTemplate({ data }: { data: MktLinksData }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Liens de tracking</h1>
        <p className="text-sm text-muted-foreground">{data.period}</p>
      </div>

      <LiensView data={data} />
    </div>
  )
}
