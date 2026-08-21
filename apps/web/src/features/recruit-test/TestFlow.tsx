'use client'

// Parcours public `/postuler` — la machine à états du candidat, de l'intro au verdict.
//
// Deux règles gouvernent ce fichier :
//
// 1. **Une hésitation ne coûte pas une tentative.** `startAttempt` est plafonné à 5 appels par IP
//    et par 24 h ; il n'est donc appelé QUE depuis le bouton « Commencer », et uniquement quand il
//    n'y a rien à reprendre en `sessionStorage`. Un rechargement, un onglet fermé par erreur ou un
//    réseau qui saute reprennent la tentative en cours (`components/flow-state.ts`).
// 2. **Aucun chiffre de barème à l'écran.** Et pas seulement « pas affiché » : les actions
//    n'en RENVOIENT plus aucun (`saveQi` et `scoreAttempt` rendent un simple accusé, cf.
//    `types.ts`). Le candidat ne voit qu'une progression, puis une réussite ou une raison
//    qualitative — comme chez GLA.
//
// Les erreurs d'action se rattrapent sur place (toast + on reste sur l'étape). Seul un refus
// MÉTIER à l'entrée (`test fermé`, `déjà passé`, `trop de tentatives`) est un cul-de-sac assumé —
// une coupure réseau, elle, reste toujours réessayable (`components/safe-action.ts`).

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { saveConnection, saveQi, saveTyping, startAttempt, submitCandidate } from './actions'
import { scoreAttempt, sendToBot } from './actions-bot'
import {
  clearFlow,
  deviceId,
  readFlow,
  readResult,
  writeFlow,
  writeResult,
  type ChatMessage,
  type FlowState,
  type FlowStep,
} from './components/flow-state'
import { ProgressDots } from './components/progress-dots'
import { safe } from './components/safe-action'
import { StepBlocked } from './components/step-blocked'
import { StepBot } from './components/step-bot'
import { StepConnection } from './components/step-connection'
import { StepDone } from './components/step-done'
import { StepIdentity, type IdentityForm, type SubmitFailure } from './components/step-identity'
import { StepIntro } from './components/step-intro'
import { StepQi } from './components/step-qi'
import { StepTyping, type TypingResult } from './components/step-typing'
import { BOT_ALREADY_SENT, CHAT_OVER, mediaLabel, NO_ATTEMPT, type SubmitResult } from './types'

/** Rang de chaque étape dans « Étape x/5 ». */
const STEP_INDEX: Record<FlowStep, number> = { qi: 1, typing: 2, connection: 3, bot: 4, identity: 5 }

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
    // Le verdict d'abord : une fois le test soumis, le parcours est effacé et c'est l'écran final
    // (avec le lien Discord des candidats reçus) qui doit revenir, pas l'intro.
    const verdict = readResult()
    if (verdict) setResult(verdict)
    else setFlow(readFlow())
  }

  useEffect(() => {
    if (flow) writeFlow(flow)
  }, [flow])

  const attemptId = flow?.attemptId

  async function start() {
    const res = await safe(() => startAttempt({ device: deviceId() }))
    if (!res.success) {
      // Coupure réseau : AUCUNE tentative n'a été créée (et si le serveur en a créé une malgré la
      // réponse perdue, le plafond de 5/IP/24 h laisse la marge). On reste donc sur l'intro, le
      // bouton redevient actif — un `StepBlocked` ici serait un cul-de-sac pour une simple panne.
      if (res.transport) {
        toast.error(res.error)
        return
      }
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
      // Chrono de la 1re question : posé ICI, avec le reste du parcours, donc persisté d'emblée.
      qiDeadline: Date.now() + d.qiTimer * 1000,
    })
  }

  /**
   * Chaque réponse est persistée aussitôt, AVEC l'échéance de la question suivante : le chrono vit
   * dans l'état persisté et non dans l'étape, sinon un F5 rendrait 30 s neuves à volonté.
   */
  const recordAnswers = useCallback((answers: (number | null)[]) => {
    setFlow((f) => (f ? { ...f, answers, qiDeadline: Date.now() + f.qiTimer * 1000 } : f))
  }, [])

  const finishQi = useCallback(
    async (answers: (number | null)[]) => {
      if (!attemptId) return false
      const res = await safe(() => saveQi({ attemptId, answers }))
      if (!res.success) {
        toast.error(res.error)
        return false
      }
      // Plus de question en cours ⇒ plus d'échéance à tenir.
      setFlow((f) => (f ? { ...f, step: 'typing', answers, qiDeadline: null } : f))
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
    setFlow((f) => (f ? { ...f, step: 'identity' } : f))
  }, [attemptId])

  const send = useCallback(
    async (input: { body?: string; mediaPrice?: number }) => {
      if (!attemptId) return
      // Message affiché tout de suite : le serveur met une bonne seconde à répondre. En cas
      // d'échec il ANNULE le tour (le message candidat est retiré en base) — on retire donc
      // aussi le nôtre, sinon l'écran garderait un message sans réponse. SAUF sur « déjà
      // envoyé » : là, le message EST en base (cf. plus bas).
      const mine: ChatMessage =
        input.mediaPrice != null
          ? { speaker: 'candidat', body: mediaLabel(input.mediaPrice), mediaPrice: input.mediaPrice }
          : { speaker: 'candidat', body: input.body ?? '' }
      setSending(true)
      setFlow((f) => (f ? { ...f, chat: [...f.chat, mine] } : f))

      const res = await safe(() => sendToBot({ attemptId, ...input }))
      if (!res.success) {
        // « Message déjà envoyé. » (23505 sur la position) = le message a bien été écrit, c'est
        // notre renvoi qui est refusé. Le retirer de l'écran ferait disparaître un message qui
        // existe côté serveur, et que la notation lira. Tous les autres échecs (panne IA, réseau)
        // annulent le tour côté serveur : là, le rollback est la bonne réponse.
        if (res.error !== BOT_ALREADY_SENT) {
          setFlow((f) => (f ? { ...f, chat: f.chat.filter((m) => m !== mine) } : f))
        }
        setSending(false)
        // « La conversation est terminée. » : le serveur ne prendra plus AUCUN message sur cette
        // tentative. Un toast laisserait le candidat sur un écran de saisie définitivement muet —
        // on prend donc la même sortie que `done` : notation, puis identité. Pas de toast : rien
        // n'a échoué de son point de vue, l'épreuve est simplement finie.
        if (res.error === CHAT_OVER) {
          await finishBot()
          return
        }
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
      // Le test est joué : plus rien à reprendre, on libère la session. Le VERDICT, lui, est écrit
      // AVANT — un candidat reçu qui recharge doit retrouver son lien Discord (son seul livrable),
      // pas un « Tu as déjà passé le test ».
      writeResult(res.data)
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
          // Une échéance existe TOUJOURS à cette étape : `start` la pose, `recordAnswers` la
          // renouvelle, `readFlow` en fabrique une pour les sessions ouvertes avant ce champ. Le
          // repli couvre un état qui ne devrait pas exister, et le fait ÉCHOUER FERMÉ (échéance
          // dépassée = question en cours perdue) plutôt que d'offrir du temps gratuit.
          deadline={flow.qiDeadline ?? 0}
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
