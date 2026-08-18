'use client'

import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { FAULT_LABELS, type CaseKind, type FaultCode } from '@/lib/types/training'
import type { ComposerInput } from '../schema'
import type { SessionThread } from '../types'
import { Composer } from './composer'
import { MessageList } from './message-list'

/** Une conversation : messages révélés, chrono, composer. Chrono écoulé → `onTimeout` (le serveur tranche). */
export function ThreadPanel({
  thread,
  kind,
  now,
  onSend,
  onTimeout,
}: {
  thread: SessionThread
  kind: CaseKind
  now: number
  onSend: (v: ComposerInput) => Promise<boolean>
  onTimeout: (threadId: string) => void
}) {
  const visible = thread.messages.filter((m) => Date.parse(m.visibleAt) <= now)
  const pendingFan = thread.messages.some((m) => m.speaker === 'fan' && Date.parse(m.visibleAt) > now)
  const last = visible[visible.length - 1]
  const dueMs = thread.nextDueAt ? Date.parse(thread.nextDueAt) - now : null
  const remaining = dueMs != null && !pendingFan ? Math.max(0, Math.ceil(dueMs / 1000)) : null
  const expired = thread.status === 'open' && dueMs != null && !pendingFan && dueMs < -500
  useEffect(() => {
    if (expired) onTimeout(thread.id)
  }, [expired, onTimeout, thread.id])
  const canWrite = thread.status === 'open' && !pendingFan && !expired && last?.speaker !== 'chatter' && thread.turnsUsed < thread.maxTurns
  const lost = thread.status === 'lost' ? (FAULT_LABELS[(thread.lostReason ?? 'timeout') as FaultCode | 'timeout'] ?? FAULT_LABELS.timeout) : null

  return (
    <section className="flex flex-col rounded-xl border">
      <header className="flex items-center gap-3 border-b px-4 py-2 text-sm">
        <span className="font-medium">{thread.fanName}</span>
        {thread.bossFan && (
          <span className="text-muted-foreground">
            {[thread.bossFan.age && `${thread.bossFan.age} ans`, thread.bossFan.job, thread.bossFan.city].filter(Boolean).join(' · ')}
          </span>
        )}
        <span className="ml-auto tabular-nums text-muted-foreground">
          {thread.turnsUsed}/{thread.maxTurns} tours
        </span>
        {remaining != null && thread.status === 'open' && (
          <Badge variant={remaining <= 10 ? 'destructive' : 'secondary'} className="tabular-nums">
            ⏱ {remaining} s
          </Badge>
        )}
      </header>
      <MessageList messages={visible} pendingFan={pendingFan} fanName={thread.fanName} />
      {lost ? (
        <p className="border-t px-4 py-3 text-sm">
          <span className="font-medium">{lost.title}.</span> {lost.text}
        </p>
      ) : thread.status === 'done' ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">
          Conversation terminée{kind === 'solo' ? '' : ' — passe à une autre'}.
        </p>
      ) : (
        <Composer disabled={!canWrite} onSend={onSend} />
      )}
    </section>
  )
}
