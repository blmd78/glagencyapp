'use client'

// Parcours public `/postuler` — la machine à états du candidat, de l'intro au verdict.
//
// Deux règles gouvernent ce fichier :
//
// 1. **Une hésitation ne coûte pas une tentative.** `startAttempt` est plafonné à 5 appels par IP
//    et par 24 h ; il n'est donc appelé QUE depuis le bouton « Commencer », et uniquement quand il
//    n'y a rien à reprendre en `sessionStorage`. Un rechargement, un onglet fermé par erreur ou un
//    réseau qui saute reprennent la tentative en cours (`components/flow-state.ts`).
// 2. **Aucun chiffre de barème à l'écran.** `saveQi` rend le score QI et `scoreAttempt` le total du
//    bot : les deux servent l'état du parcours, PAS l'affichage — GLA ne les montrait pas, nous non
//    plus. Le candidat ne voit qu'une progression, puis une réussite ou une raison qualitative.
//
// Les erreurs d'action se rattrapent sur place (toast + on reste sur l'étape), sauf à l'entrée où
// un refus (`test fermé`, `déjà passé`, `trop de tentatives`) est un cul-de-sac assumé.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import type { ActionResult } from '@/lib/actions'
import { saveConnection, saveQi, saveTyping, startAttempt, submitCandidate } from './actions'
import { scoreAttempt, sendToBot } from './actions-bot'
import { clearFlow, deviceId, readFlow, writeFlow, type ChatMessage, type FlowState, type FlowStep } from './components/flow-state'
import { ProgressDots } from './components/progress-dots'
import { StepBlocked } from './components/step-blocked'
import { StepBot } from './components/step-bot'
import { StepConnection } from './components/step-connection'
import { StepDone } from './components/step-done'
import { StepIdentity, type IdentityForm, type SubmitFailure } from './components/step-identity'
import { StepIntro } from './components/step-intro'
import { StepQi } from './components/step-qi'
import { StepTyping, type TypingResult } from './components/step-typing'
import type { SubmitResult } from './types'

/** Rang de chaque étape dans « Étape x/5 ». */
const STEP_INDEX: Record<FlowStep, number> = { qi: 1, typing: 2, connection: 3, bot: 4, identity: 5 }

const OFFLINE = 'Connexion perdue — réessaie.'
const NO_ATTEMPT = 'Test introuvable — recommence depuis le début.'

/**
 * Un appel de Server Action qui échoue AU RÉSEAU rejette au lieu de rendre un `ActionResult` : sans
 * ce filet, la promesse partirait en rejet non géré et l'écran se figerait sans rien dire.
 */
async function safe<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run()
  } catch {
    return { success: false, error: OFFLINE }
  }
}

// « Sommes-nous passés côté navigateur ? » — `useSyncExternalStore` rend le snapshot SERVEUR
// (`false`) pendant le SSR *et* pendant l'hydratation, puis le snapshot client (`true`). C'est ce
// qui autorise à lire le `sessionStorage` sans divergence d'hydratation, et sans `setState` dans un
// effet (`react-hooks/set-state-in-effect`). Rien à écouter : la valeur ne change qu'une fois.
const noSubscribe = () => () => {}

export function TestFlow() {
  const [flow, setFlow] = useState<FlowState | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [sending, setSending] = useState(false)
  const [scoring, setScoring] = useState(false)

  // Reprise AVANT tout appel serveur (cf. règle 1 en tête de fichier) : ajustement d'état AU
  // RENDER, une seule fois (patron react.dev « adjusting state during render », déjà utilisé par
  // `insights/components/insight-card.tsx`).
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false)
  const [restored, setRestored] = useState(false)
  if (hydrated && !restored) {
    setRestored(true)
    setFlow(readFlow())
  }

  useEffect(() => {
    if (flow) writeFlow(flow)
  }, [flow])

  const attemptId = flow?.attemptId

  async function start() {
    const res = await safe(() => startAttempt({ device: deviceId() }))
    if (!res.success) {
      setBlocked(res.error)
      return
    }
    const d = res.data
    setFlow({
      attemptId: d.attemptId,
      step: 'qi',
      persona: d.persona,
      qi: d.qi,
      typingText: d.typingText,
      qiTimer: d.qiTimer,
      botMessages: d.botMessages,
      answers: [],
      chat: [],
    })
  }

  /** Chaque réponse est persistée aussitôt : recharger la page ne rend pas 30 s de plus par question. */
  const recordAnswers = useCallback((answers: (number | null)[]) => {
    setFlow((f) => (f ? { ...f, answers } : f))
  }, [])

  const finishQi = useCallback(
    async (answers: (number | null)[]) => {
      if (!attemptId) return false
      const res = await safe(() => saveQi({ attemptId, answers }))
      if (!res.success) {
        toast.error(res.error)
        return false
      }
      // `res.data.qiScore` volontairement ignoré : le score ne s'affiche jamais.
      setFlow((f) => (f ? { ...f, step: 'typing', answers } : f))
      return true
    },
    [attemptId],
  )

  const finishTyping = useCallback(
    async (typing: TypingResult) => {
      if (!attemptId) return false
      const res = await safe(() => saveTyping({ attemptId, ...typing }))
      if (!res.success) {
        toast.error(res.error)
        return false
      }
      setFlow((f) => (f ? { ...f, step: 'connection' } : f))
      return true
    },
    [attemptId],
  )

  const finishConnection = useCallback(
    async (mbps: number) => {
      if (!attemptId) return false
      const res = await safe(() => saveConnection({ attemptId, mbps }))
      if (!res.success) {
        toast.error(res.error)
        return false
      }
      setFlow((f) => (f ? { ...f, step: 'bot' } : f))
      return true
    },
    [attemptId],
  )

  /** Notation de la conversation — déclenchée d'office au dernier échange, réessayable au clic. */
  const finishBot = useCallback(async () => {
    if (!attemptId) return
    setScoring(true)
    const res = await safe(() => scoreAttempt({ attemptId }))
    setScoring(false)
    if (!res.success) {
      toast.error(res.error)
      return
    }
    // `res.data.total` volontairement ignoré (cf. règle 2).
    setFlow((f) => (f ? { ...f, step: 'identity' } : f))
  }, [attemptId])

  const send = useCallback(
    async (input: { body?: string; mediaPrice?: number }) => {
      if (!attemptId) return
      // Message affiché tout de suite : le serveur met une bonne seconde à répondre. En cas
      // d'échec il ANNULE le tour (le message candidat est retiré en base) — on retire donc
      // aussi le nôtre, sinon l'écran garderait un message sans réponse.
      const mine: ChatMessage =
        input.mediaPrice != null
          ? { speaker: 'candidat', body: `[MEDIA VERROUILLE - ${input.mediaPrice}€]`, mediaPrice: input.mediaPrice }
          : { speaker: 'candidat', body: input.body ?? '' }
      setSending(true)
      setFlow((f) => (f ? { ...f, chat: [...f.chat, mine] } : f))

      const res = await safe(() => sendToBot({ attemptId, ...input }))
      if (!res.success) {
        setFlow((f) => (f ? { ...f, chat: f.chat.filter((m) => m !== mine) } : f))
        setSending(false)
        toast.error(res.error)
        return
      }
      setFlow((f) => (f ? { ...f, chat: [...f.chat, { speaker: 'client', body: res.data.reply }] } : f))
      setSending(false)
      if (res.data.done) await finishBot()
    },
    [attemptId, finishBot],
  )

  const submit = useCallback(
    async (values: IdentityForm): Promise<SubmitFailure | null> => {
      if (!attemptId) return { error: NO_ATTEMPT }
      const res = await safe(() => submitCandidate({ attemptId, ...values }))
      if (!res.success) return { error: res.error, fieldErrors: res.fieldErrors }
      // Le test est joué : plus rien à reprendre, on libère la session.
      clearFlow()
      setFlow(null)
      setResult(res.data)
      return null
    },
    [attemptId],
  )

  if (!restored) return <Shell><Skeleton className="h-72 w-full" /></Shell>
  if (result) return <Shell><StepDone result={result} /></Shell>
  if (blocked) return <Shell><StepBlocked message={blocked} /></Shell>
  if (!flow) return <Shell><StepIntro onStart={start} /></Shell>
  if (scoring) {
    return (
      <Shell step={STEP_INDEX.bot}>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Spinner className="size-6" />
          <p className="text-sm text-muted-foreground">Analyse de ta conversation…</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell step={STEP_INDEX[flow.step]}>
      {flow.step === 'qi' && (
        <StepQi
          questions={flow.qi}
          timer={flow.qiTimer}
          initial={flow.answers}
          onAnswer={recordAnswers}
          onDone={finishQi}
        />
      )}
      {flow.step === 'typing' && <StepTyping text={flow.typingText} onDone={finishTyping} />}
      {flow.step === 'connection' && <StepConnection onDone={finishConnection} />}
      {flow.step === 'bot' && (
        <StepBot
          persona={flow.persona}
          botMessages={flow.botMessages}
          chat={flow.chat}
          sending={sending}
          onSend={send}
          onFinish={finishBot}
        />
      )}
      {flow.step === 'identity' && <StepIdentity onSubmit={submit} />}
    </Shell>
  )
}

/** Coquille commune : une carte centrée, avec le repère d'étape quand il y en a un. */
function Shell({ step, children }: { step?: number; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-6 p-6 sm:p-8">
      {step != null && <ProgressDots current={step} />}
      {children}
    </Card>
  )
}
