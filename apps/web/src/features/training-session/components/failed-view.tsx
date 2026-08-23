import { FAULT_LABELS, type FaultCode } from '@/lib/types/training'
import type { SessionData } from '../types'
import { DefeatSound } from './defeat-sound'
import { ResultActions } from './result-actions'
import { TranscriptView } from './transcript-view'

/**
 * Session RATÉE (`failed` : chrono expiré ou faute grave — un seul thread, solo) ou ABANDONNÉE
 * (`abandoned` : le chatter a quitté avant la fin). Pas de note, pas de Signaler (réservé aux
 * sessions notées — `ResultActions` le garde tout seul).
 */
export function FailedView({ data, viewerIsOwner }: { data: SessionData; viewerIsOwner: boolean }) {
  const s = data.snapshot

  if (data.status === 'abandoned') {
    // Deux façons d'arriver ici : l'abandon volontaire, et l'EXPIRATION (spec §5 — défi/boss dont
    // tous les chronos étaient dépassés au retour, cf. `expireSession` : tous les threads sont
    // alors `lost/timeout`). Un abandon volontaire laisse les threads tels quels.
    const expired = data.threads.length > 0 && data.threads.every((t) => t.status === 'lost' && t.lostReason === 'timeout')
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border p-10 text-center">
        <h1 className="text-xl font-semibold">{expired ? 'La session a expiré' : 'Session abandonnée'}</h1>
        <p className="text-sm text-muted-foreground">
          {expired
            ? 'Tous les chronos étaient dépassés à ton retour — rien n’a été noté.'
            : 'Tu as quitté avant la fin — cette session ne compte pas. Retente quand tu veux.'}
        </p>
        <ResultActions data={data} viewerIsOwner={viewerIsOwner} />
      </div>
    )
  }

  const thread = data.threads[0]
  const reason = (thread?.lostReason ?? 'timeout') as FaultCode | 'timeout'
  const fault = FAULT_LABELS[reason] ?? FAULT_LABELS.timeout

  return (
    <div className="flex flex-col gap-6">
      <DefeatSound sessionId={data.id} viewerIsOwner={viewerIsOwner} />
      <div className="flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
        <p className="text-4xl" aria-hidden>
          {reason === 'timeout' ? '⏱️' : '💀'}
        </p>
        <h1 className="text-xl font-semibold">{fault.title}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">{fault.text}</p>
        <p className="text-sm text-muted-foreground">
          {s.moduleTitle} · {s.title}
        </p>
        <ResultActions data={data} viewerIsOwner={viewerIsOwner} />
      </div>
      {thread && <TranscriptView thread={thread} open />}
    </div>
  )
}
