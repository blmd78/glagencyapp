import { medalFor } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { CASE_KIND_LABELS, MEDAL_LABELS } from '@/lib/types/training'
import type { SessionData } from '../types'
import { ResultActions } from './result-actions'
import { ScorePanel } from './score-panel'
import { ThreadResult } from './thread-result'
import { TranscriptView } from './transcript-view'

/**
 * Session NOTÉE. En-tête : note /100, médaille (texte, badge outline — pas de doré), objectif atteint /
 * plafonné à 65, record vs meilleur précédent. Solo : un ScorePanel + « ce qui était attendu » + transcription.
 * Défi / boss : une carte par conversation (ThreadResult), note globale = moyenne.
 */
export function ResultView({ data, viewerIsOwner }: { data: SessionData; viewerIsOwner: boolean }) {
  const s = data.snapshot
  const medal = medalFor(data.total)
  const solo = data.kind === 'solo'
  const single = data.threads[0]
  const improved = data.total != null && data.previousBest != null && data.total > data.previousBest
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{s.moduleTitle} · {CASE_KIND_LABELS[data.kind]}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
      </header>
      <section className="flex flex-wrap items-end gap-6 rounded-xl border p-6">
        <div>
          <p className="text-5xl font-semibold tabular-nums">{data.total ?? '—'}<span className="text-lg text-muted-foreground">/100</span></p>
          <p className="mt-1 text-sm text-muted-foreground">
            {medal ? `Médaille ${MEDAL_LABELS[medal]}` : 'À valider (60 minimum)'}
            {data.previousBest != null && ` · précédent ${data.previousBest}`}
            {improved && ' · nouveau record'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{data.kind === 'boss' ? (data.objectiveReached ? 'Boss réussi' : 'Boss non réussi') : data.objectiveReached ? `${s.objectiveLabel} atteint` : `${s.objectiveLabel} non atteint`}</Badge>
          {solo && single?.score?.capped && <Badge variant="outline">Plafonné à 65</Badge>}
        </div>
        <div className="ml-auto"><ResultActions data={data} viewerIsOwner={viewerIsOwner} /></div>
      </section>
      {solo && single?.score ? (
        <>
          <ScorePanel score={single.score} objectiveLabel={s.objectiveLabel} />
          {data.expected && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer text-sm font-medium">Ce qui était attendu</summary>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{data.expected}</p>
            </details>
          )}
          <TranscriptView thread={single} />
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.threads.map((t) => <ThreadResult key={t.id} thread={t} kind={data.kind} objectiveLabel={s.objectiveLabel} />)}
        </div>
      )}
    </div>
  )
}
