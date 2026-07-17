import { LiensView } from './components/liens-view'
import type { MktLinksData } from './types'

export function MktLiensTemplate({ data }: { data: MktLinksData }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">{data.period}</p>

      <LiensView data={data} />
    </div>
  )
}
