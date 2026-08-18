import { FAULT_LABELS, type CaseKind, type FaultCode } from '@/lib/types/training'
import type { SessionThread } from '../types'
import { ScorePanel } from './score-panel'
import { TranscriptView } from './transcript-view'

/**
 * Une carte par conversation (défi / boss) : fan (+ `bossFan` pour le boss), note ou « Perdu »,
 * détail du score ou raison de la perte, transcription repliée. Boss : axes /100 (6 étapes),
 * sinon /25 — même barème que le solo.
 */
export function ThreadResult({
  thread,
  kind,
  objectiveLabel,
}: {
  thread: SessionThread
  kind: CaseKind
  objectiveLabel: string
}) {
  const lost = thread.status === 'lost'
  const fault = lost ? (FAULT_LABELS[(thread.lostReason ?? 'timeout') as FaultCode | 'timeout'] ?? FAULT_LABELS.timeout) : null

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{thread.fanName}</p>
          {thread.bossFan && (
            <p className="text-sm text-muted-foreground">
              {[thread.bossFan.age && `${thread.bossFan.age} ans`, thread.bossFan.job, thread.bossFan.city].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <p className="shrink-0 text-right text-sm font-medium">
          {fault ? `Perdu — ${fault.title}` : thread.score ? `${thread.score.total}/100` : '—'}
        </p>
      </header>
      {!lost && thread.score ? (
        <ScorePanel score={thread.score} objectiveLabel={objectiveLabel} axisMax={kind === 'boss' ? 100 : 25} />
      ) : (
        fault && <p className="text-sm text-muted-foreground">{fault.text}</p>
      )}
      <TranscriptView thread={thread} open={false} />
    </div>
  )
}
