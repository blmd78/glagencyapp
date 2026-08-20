'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { QiQuestion } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Test de logique — une question à la fois, chronométrée (`qiTimer`, 30 s par défaut). Temps
 * écoulé = réponse `null`, qui compte faux et fait avancer d'office : c'est la mécanique GLA, et
 * `saveQiInput` attend exactement 5 réponses, `null` compris.
 *
 * Le score n'est JAMAIS montré ici (GLA ne le montrait pas non plus) : il remonte de `saveQi`
 * pour l'état serveur, l'écran passe simplement à l'épreuve suivante.
 */
export function StepQi({
  questions,
  timer,
  initial,
  onAnswer,
  onDone,
}: {
  questions: QiQuestion[]
  timer: number
  /** Réponses déjà données (reprise après rechargement) — l'épreuve redémarre où elle en était. */
  initial: (number | null)[]
  /** Remonte la liste à chaque réponse, pour qu'un rechargement ne redonne pas de temps. */
  onAnswer: (answers: (number | null)[]) => void
  /** Rend `false` si l'enregistrement a échoué — l'écran propose alors de réessayer. */
  onDone: (answers: (number | null)[]) => Promise<boolean>
}) {
  const [index, setIndex] = useState(initial.length)
  // Échéance ABSOLUE plutôt qu'un décompte : un onglet mis en veille (les timers y sont bridés)
  // reprend au bon temps restant au lieu de rendre 30 s de sursis.
  const [deadline, setDeadline] = useState(() => Date.now() + timer * 1000)
  const [now, setNow] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  // Reprise avec les 5 réponses déjà données : `saveQi` n'était pas passé (panne réseau) —
  // l'écran ouvre directement sur « Réessayer », sans rejouer le questionnaire.
  const [failed, setFailed] = useState(initial.length >= questions.length)
  // Ref et non state : `answer` doit lire la liste À JOUR même si deux clics tombent dans le même
  // cycle de rendu (c'est aussi ce qui rend la garde anti-double-clic fiable).
  const answers = useRef<(number | null)[]>(initial)

  const submit = useCallback(
    async (all: (number | null)[]) => {
      setSaving(true)
      const ok = await onDone(all)
      setSaving(false)
      setFailed(!ok)
    },
    [onDone],
  )

  const answer = useCallback(
    (choice: number | null) => {
      // Une seule réponse par question : au 2e appel, la liste a déjà avancé.
      if (answers.current.length !== index) return
      const all = [...answers.current, choice]
      answers.current = all
      onAnswer(all)
      if (all.length >= questions.length) {
        void submit(all)
        return
      }
      setIndex(all.length)
      setDeadline(Date.now() + timer * 1000)
    },
    [index, onAnswer, questions.length, submit, timer],
  )

  // Un seul intervalle pour toute l'épreuve (deps vides) : il ne fait qu'avancer l'horloge, la
  // remise à zéro du chrono vient de `setDeadline` au changement de question.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [])

  const remaining = Math.max(0, deadline - now)
  useEffect(() => {
    if (!saving && !failed && remaining <= 0) answer(null)
  }, [saving, failed, remaining, answer])

  if (saving) return <p className="py-8 text-center text-sm text-muted-foreground">Enregistrement de tes réponses…</p>

  if (failed) {
    return (
      <div className="flex flex-col gap-4 py-4 text-center">
        <p className="text-sm text-muted-foreground">Tes réponses n’ont pas pu être enregistrées.</p>
        <ActionButton onClick={() => void submit(answers.current)}>Réessayer</ActionButton>
      </div>
    )
  }

  const question = questions[index]
  if (!question) return null
  const seconds = Math.ceil(remaining / 1000)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>
            🧠 Logique · question {index + 1} sur {questions.length}
          </span>
          {/* Les 5 dernières secondes passent au rouge (repère GLA). */}
          <span aria-live="off" className={cn('tabular-nums', seconds <= 5 && 'text-destructive')}>
            ⏱ {seconds} s
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-200 ease-linear"
            style={{ width: `${(remaining / (timer * 1000)) * 100}%` }}
            aria-hidden
          />
        </div>
      </div>

      <p className="text-base font-medium">{question.q}</p>

      <div className="flex flex-col gap-2">
        {question.opts.map((opt, i) => (
          <Button
            key={`${index}-${opt}`}
            type="button"
            variant="outline"
            className="h-auto w-full justify-start px-4 py-3 text-left text-sm font-normal whitespace-normal"
            onClick={() => answer(i)}
          >
            {opt}
          </Button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Réponds vite : à la fin du chrono, on passe automatiquement à la question suivante.
      </p>
    </div>
  )
}
