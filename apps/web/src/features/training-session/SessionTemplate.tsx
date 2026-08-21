import { FailedView } from './components/failed-view'
import { ResultView } from './components/result-view'
import { SessionView } from './components/session-view'
import type { SessionData } from './types'

/** Session : jeu (active, propriétaire) ou issue (notée / ratée / abandonnée) — Server Component, aucun fetch. */
export function SessionTemplate({ data, viewerIsOwner }: { data: SessionData; viewerIsOwner: boolean }) {
  if (data.status === 'active' && viewerIsOwner) return <SessionView data={data} />
  if (data.status === 'active') return <p className="text-sm text-muted-foreground">Session en cours (lecture seule).</p>
  if (data.status === 'scored') return <ResultView data={data} viewerIsOwner={viewerIsOwner} />
  return <FailedView data={data} viewerIsOwner={viewerIsOwner} /> // failed | abandoned
}
