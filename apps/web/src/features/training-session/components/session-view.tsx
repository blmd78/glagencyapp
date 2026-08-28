'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { reactionSecondsFor, type SessionStatus } from '@/lib/types/training'
import { revealThread, sendMessage } from '../actions'
import { expireSession, timeoutThread } from '../actions-lifecycle'
import type { ComposerInput } from '../schema'
import type { SessionData, SessionThread } from '../types'
import { SessionContext } from './session-context'
import { SessionHeader } from './session-header'
import { ThreadPanel } from './thread-panel'
import { ThreadTabs } from './thread-tabs'
import { useNow } from './use-now'
import { useScoring } from './use-scoring'

/**
 * Session ACTIVE : état local des threads (messages, statut, chrono) alimenté par les retours des
 * actions ; horloge alignée serveur ; fin de session → notation → refresh (le RSC affiche le résultat).
 * Une seule conversation en solo ; onglets en défi / boss.
 */
export function SessionView({ data }: { data: SessionData }) {
  const router = useRouter()
  const now = useNow(data.serverNow)
  const [threads, setThreads] = useState<SessionThread[]>(data.threads)
  // `router.refresh()` re-rend le Server Component et fait descendre de NOUVELLES props — mais un
  // `useState` initialisé une fois les ignore. Sans cette resynchronisation, le rafraîchissement
  // déclenché après un échec d'envoi ne servait à RIEN : l'écran gardait le message que le serveur
  // venait de retirer, et un chrono périmé. On remplace l'état par la vérité serveur quand elle
  // change — après un échec, c'est elle qui fait foi, pas l'optimiste local.
  // Patron React officiel « ajuster l'état quand une prop change » : mémoriser la dernière valeur
  // SERVEUR dans un état, la comparer pendant le rendu. Un `useRef` ferait la même chose mais le
  // lint l'interdit (`react-hooks/refs` : lire `.current` pendant le rendu), et un `useEffect`
  // rendrait une frame avec l'état périmé.
  const [lastServer, setLastServer] = useState(data.threads)
  if (lastServer !== data.threads) {
    setLastServer(data.threads)
    setThreads(data.threads)
  }
  const [current, setCurrent] = useState(data.threads[0]?.id ?? '')
  const [ended, setEnded] = useState(!!data.endedAt)
  const [timeoutFailed, setTimeoutFailed] = useState<Set<string>>(new Set())
  const { scoring, error: scoreError, run: runScoring } = useScoring(data.id)
  const firing = useRef(new Set<string>())
  const expiring = useRef(false)

  useEffect(() => {
    if (ended) void runScoring()
  }, [ended, runScoring])

  // Spec §5 « Interruption » — défi/boss : le chatter revient et TOUS ses chronos sont dépassés.
  // Une seule tentative, AU CHARGEMENT (l'horloge serveur du rendu fait foi ; pendant la partie les
  // chronos sont traités thread par thread par `handleTimeout`). Le serveur revérifie tout ; s'il
  // refuse, on n'insiste pas — l'affichage reste jouable.
  useEffect(() => {
    if (expiring.current || data.kind === 'solo') return
    const at = Date.parse(data.serverNow)
    const open = data.threads.filter((t) => t.status === 'open')
    if (!open.length || !open.every((t) => t.nextDueAt != null && Date.parse(t.nextDueAt) < at - 2000)) return
    expiring.current = true
    // Course avec `ThreadPanel` : on verrouille tout de suite les threads ouverts dans `firing` pour
    // que `handleTimeout` ne puisse pas déclencher un `timeoutThread` pendant que `expireSession` est
    // en vol (ce qui fermerait le dernier thread et provoquerait la notation d'une session que la
    // spec veut voir abandonnée). Si le serveur refuse l'expiration, on les libère pour laisser la
    // voie normale du timeout par thread reprendre la main.
    const openIds = open.map((t) => t.id)
    for (const id of openIds) firing.current.add(id)
    void expireSession({ sessionId: data.id }).then((r) => {
      if (r.success && r.data.expired) {
        router.refresh()
        return
      }
      for (const id of openIds) firing.current.delete(id)
    })
  }, [data.id, data.kind, data.serverNow, data.threads, router])

  const patch = useCallback((threadId: string, f: (t: SessionThread) => SessionThread) => {
    setThreads((ts) => ts.map((t) => (t.id === threadId ? f(t) : t)))
  }, [])

  // RÉVÉLATION : le serveur retient le corps des messages non encore visibles (`get-session`,
  // `sendMessage`) — ils arrivent avec `body: ''`. À l'échéance, on va chercher le texte. Un thread
  // n'est demandé QU'UNE FOIS (`revealed`), et un échec laisse la bulle vide plutôt que de boucler :
  // le prochain rendu du serveur (fin de session, rafraîchissement) la remplira.
  // Garde PAR MESSAGE (pas par thread) : chaque bulle n'est demandée qu'une fois. Une réponse qui
  // ne ramène pas le corps (décalage d'horloge, échec réseau) laisse la bulle vide jusqu'au prochain
  // rendu serveur — jamais une rafale d'appels sur le même message.
  const revealed = useRef(new Set<string>())
  useEffect(() => {
    for (const t of threads) {
      const due = t.messages.filter((m) => m.body === '' && Date.parse(m.visibleAt) <= now && !revealed.current.has(m.id))
      if (!due.length) continue
      for (const m of due) revealed.current.add(m.id)
      void revealThread({ threadId: t.id }).then((r) => {
        if (!r.success) return
        const bodies = new Map(r.data.messages.map((m) => [m.id, m.body]))
        patch(t.id, (th) => ({
          ...th,
          messages: th.messages.map((m) => (m.body === '' && bodies.get(m.id) ? { ...m, body: bodies.get(m.id)! } : m)),
        }))
      })
    }
  }, [threads, now, patch])
  // Un statut encore `active` veut dire que LE thread qu'on vient de traiter a clos la session côté
  // serveur (ended_at posé, pas encore notée) : on note côté client. Tout autre statut (`scored`,
  // `failed`, `abandoned`…) veut dire que la session était déjà résolue — potentiellement par un
  // autre onglet — et que le serveur refuserait une notation côté client : on se contente de refetch
  // (router.refresh) pour afficher l'état réel, sans boucle de relance.
  const onSessionEnd = useCallback(
    (status: SessionStatus) => {
      if (status === 'active') setEnded(true)
      else router.refresh()
    },
    [router],
  )

  // Threads dont l'envoi est EN VOL. GLA appelait `trainTimerStop()` en tête de `trainSend`
  // (index.html:1769) et ne relançait le chrono qu'à la réponse du fan (`:1798`) : le temps de
  // l'aller-retour IA ne comptait pas. Ici `next_due_at` reste figé en base pendant l'appel, donc
  // sans cet état le compte à rebours continuait de descendre et `onTimeout` pouvait marquer le
  // thread perdu ALORS QUE LE MESSAGE ÉTAIT DÉJÀ PARTI — la seconde moitié du bug signalé.
  const [sending, setSending] = useState<Set<string>>(new Set())
  const withSending = (threadId: string, on: boolean) =>
    setSending((prev) => {
      const next = new Set(prev)
      if (on) next.add(threadId)
      else next.delete(threadId)
      return next
    })

  const handleSend = async (threadId: string, input: ComposerInput): Promise<boolean> => {
    withSending(threadId, true)
    try {
      return await send(threadId, input)
    } finally {
      withSending(threadId, false)
    }
  }

  const send = async (threadId: string, input: ComposerInput): Promise<boolean> => {
    const r = await sendMessage({ threadId, ...input })
    if (!r.success) {
      toast.error(r.error)
      // On resynchronise à CHAQUE échec, sans regarder le texte du message. Le serveur a pu retirer
      // le message et réarmer le chrono (panne IA), ou fermer le thread (trop lent, course entre
      // deux onglets) : dans tous les cas l'état affiché est périmé, et aucun échec ne gagne à le
      // garder. Le tri se faisait auparavant en cherchant des bouts de phrase dans l'erreur — les
      // messages de panne IA ayant changé, la condition ne matchait plus et l'écran restait faux.
      // Le texte saisi, lui, reste : `return false` ne vide pas le composer.
      router.refresh()
      return false
    }
    const d = r.data
    patch(threadId, (t) => ({
      ...t,
      messages: [...t.messages, d.chatter, d.fan],
      status: d.thread.status,
      lostReason: d.thread.lostReason,
      turnsUsed: d.thread.turnsUsed,
      nextDueAt: d.thread.nextDueAt,
    }))
    if (d.sessionEnded) onSessionEnd(d.sessionStatus)
    return true
  }

  const handleTimeout = useCallback(
    async (threadId: string) => {
      if (firing.current.has(threadId)) return
      firing.current.add(threadId)
      const r = await timeoutThread({ threadId })
      if (!r.success) {
        // On garde le thread dans `firing` : l'effet de `ThreadPanel` ne rappelle pas tout seul
        // (pas de boucle de refresh). L'affordance « Réessayer » relance explicitement via
        // `handleRetryTimeout`.
        toast.error(r.error)
        setTimeoutFailed((s) => new Set(s).add(threadId))
        return
      }
      patch(threadId, (t) => ({ ...t, status: 'lost', lostReason: 'timeout', nextDueAt: null }))
      if (r.data.sessionEnded) onSessionEnd(r.data.sessionStatus)
    },
    [onSessionEnd, patch],
  )

  const handleRetryTimeout = useCallback(
    (threadId: string) => {
      setTimeoutFailed((s) => {
        if (!s.has(threadId)) return s
        const next = new Set(s)
        next.delete(threadId)
        return next
      })
      firing.current.delete(threadId)
      void handleTimeout(threadId)
    },
    [handleTimeout],
  )

  if (ended) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
        <p className="text-sm text-muted-foreground">{scoring ? 'Notation en cours…' : 'Session terminée'}</p>
        {scoreError && (
          <>
            <p className="text-sm">{scoreError}</p>
            <Button size="sm" onClick={() => void runScoring()}>
              Relancer la notation
            </Button>
          </>
        )}
      </div>
    )
  }
  const thread = threads.find((t) => t.id === current) ?? threads[0]
  return (
    <div className="flex flex-col gap-4">
      <SessionHeader data={data} threads={threads} onEnded={() => setEnded(true)} />
      {/* Deux colonnes (GLA `render.train`) : la consigne reste sous les yeux, collante, pendant
          que la conversation défile à droite. */}
      <div className="gla-trainwrap">
        <div className="gla-traincol-ctx">
          <SessionContext snapshot={data.snapshot} />
        </div>
        <div className="gla-traincol-chat flex flex-col gap-3">
          {threads.length > 1 && (
            <ThreadTabs threads={threads} current={thread.id} now={now} onSelect={setCurrent} sending={sending} />
          )}
          {thread && (
            <ThreadPanel
              key={thread.id}
              thread={thread}
              kind={data.kind}
              maxSeconds={reactionSecondsFor(data.kind, data.snapshot.reactionMaxS)}
              sending={sending.has(thread.id)}
              // GLA n'affichait qu'UN chrono (`#ttimer`, index.html:1728). En défi/boss les onglets
              // le portent déjà pour CHAQUE conversation : le répéter dans l'en-tête faisait doublon.
              showChrono={threads.length === 1}
              now={now}
              onSend={(v) => handleSend(thread.id, v)}
              onTimeout={handleTimeout}
              timeoutFailed={timeoutFailed.has(thread.id)}
              onRetryTimeout={handleRetryTimeout}
            />
          )}
        </div>
      </div>
    </div>
  )
}
