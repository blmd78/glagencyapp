'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { FAULT_LABELS, type CaseKind, type FaultCode } from '@/lib/types/training'
import type { ComposerInput } from '../schema'
import type { SessionThread } from '../types'
import { ChronoBadge } from './chrono-badge'
import { FanRing } from './fan-ring'
import { Composer } from './composer'
import { MessageList } from './message-list'

/**
 * Une conversation : messages révélés, chrono, composer. Chrono écoulé → `onTimeout` (le serveur
 * tranche). Si `timeoutThread` échoue (`timeoutFailed`), pas de relance automatique — le composer
 * reste désactivé et une affordance « Réessayer » appelle `onRetryTimeout`.
 */
export function ThreadPanel({
  thread,
  kind,
  maxSeconds,
  sending,
  showChrono,
  now,
  onSend,
  onTimeout,
  timeoutFailed,
  onRetryTimeout,
}: {
  thread: SessionThread
  kind: CaseKind
  /** Durée du tour (`reactionSecondsFor`), pour la part restante de l'anneau et du compteur. */
  maxSeconds: number | null
  /** Envoi en vol : le chrono se fige, exactement comme le `trainTimerStop()` de GLA. */
  sending: boolean
  /** L'en-tête porte-t-il le compteur chiffré ? Non en défi/boss, où les onglets l'affichent déjà. */
  showChrono: boolean
  now: number
  onSend: (v: ComposerInput) => Promise<boolean>
  onTimeout: (threadId: string) => void
  timeoutFailed: boolean
  onRetryTimeout: (threadId: string) => void
}) {
  const visible = thread.messages.filter((m) => Date.parse(m.visibleAt) <= now)
  const pendingFan = thread.messages.some((m) => m.speaker === 'fan' && Date.parse(m.visibleAt) > now)
  const last = visible[visible.length - 1]
  const dueMs = thread.nextDueAt ? Date.parse(thread.nextDueAt) - now : null
  // `sending` gèle le décompte ET l'expiration : sans lui, un message parti à temps pouvait être
  // déclaré perdu pendant que la Server Action était encore en vol.
  const frozen = pendingFan || sending
  const remaining = dueMs != null && !frozen ? Math.max(0, Math.ceil(dueMs / 1000)) : null
  const expired = thread.status === 'open' && dueMs != null && !frozen && dueMs < -500
  useEffect(() => {
    if (expired) onTimeout(thread.id)
  }, [expired, onTimeout, thread.id])
  // OUVERTURE (aucun tour joué) : un cas dont le script se termine par une ligne du chatter — ex. la
  // créatrice relance après un blanc — reste JOUABLE. Sans cette exception, `last?.speaker !==
  // 'chatter'` verrouillait le composer dès l'arrivée et le cas était injouable (aucun chrono armé
  // non plus, puisque l'ouverture ne finit pas par le fan : le chrono démarre à sa première réponse).
  const opening = thread.turnsUsed === 0
  const canWrite = thread.status === 'open' && !frozen && !expired && (opening || last?.speaker !== 'chatter') && thread.turnsUsed < thread.maxTurns
  const lost = thread.status === 'lost' ? (FAULT_LABELS[(thread.lostReason ?? 'timeout') as FaultCode | 'timeout'] ?? FAULT_LABELS.timeout) : null

  return (
    <section className="gla-cardbox flex flex-col p-4">
      {/* En-tête façon messagerie (GLA) : l'avatar du fan cerclé de son chrono, son nom, le point
          vert « en ligne », et le compte des échanges à droite. */}
      <header className="mb-3 flex items-center gap-2.5 border-b border-[var(--gla-border)] pb-3 text-sm">
        <FanRing
          name={thread.fanName}
          seconds={thread.status === 'open' ? remaining : null}
          maxSeconds={maxSeconds}
        />
        <span className="font-bold">{thread.fanName}</span>
        {thread.bossFan && (
          <span className="text-xs text-[var(--gla-faint)]">
            {[thread.bossFan.age && `${thread.bossFan.age} ans`, thread.bossFan.job, thread.bossFan.city].filter(Boolean).join(' · ')}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--gla-faint)]">
          <span aria-hidden className="size-[7px] rounded-full bg-[var(--gla-accent)]" />
          en ligne
        </span>
        <span className="ml-auto tabular-nums text-[var(--gla-muted)]">
          {thread.turnsUsed}/{thread.maxTurns} échanges
        </span>
        {/* Le compteur chiffré DOUBLE l'anneau, comme le `#ttimer` de GLA (`index.html:1725`) —
            l'anneau est `aria-hidden`, et un chiffre reste plus lisible sous pression. */}
        {showChrono && thread.status === 'open' && remaining != null && <ChronoBadge seconds={remaining} />}
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
        <>
          {expired && timeoutFailed && (
            <div className="flex items-center gap-2 border-t px-4 py-2 text-sm text-muted-foreground">
              <span>Le chrono n’a pas pu être validé.</span>
              <Button size="sm" variant="outline" onClick={() => onRetryTimeout(thread.id)}>
                Réessayer
              </Button>
            </div>
          )}
          <Composer disabled={!canWrite} allowMedia={thread.isSale} onSend={onSend} />
        </>
      )}
    </section>
  )
}
