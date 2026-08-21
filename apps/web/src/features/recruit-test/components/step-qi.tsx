'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { QiQuestion } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { cn } from '@/lib/utils'

/**
 * Test de logique — une question à la fois, chronométrée (`qiTimer`, 30 s par défaut). Temps
 * écoulé = réponse `null`, qui compte faux et fait avancer d'office : c'est la mécanique GLA, et
 * `saveQi` attend UNE réponse par question tirée (`null` comprises). Tout l'écran se dimensionne
 * sur `questions.length` — la banque est réglable de 1 à 20 questions côté config.
 *
 * Le score n'est JAMAIS montré ici (GLA ne le montrait pas non plus) : il remonte de `saveQi`
 * pour l'état serveur, l'écran passe simplement à l'épreuve suivante.
 */
export function StepQi({
  questions,
  timer,
  deadline,
  initial,
  onAnswer,
  onDone,
}: {
  questions: QiQuestion[]
  timer: number
  /**
   * Échéance ABSOLUE (ms epoch) de la question en cours, tenue par le PARENT et persistée avec les
   * réponses. Absolue plutôt qu'un décompte : un onglet mis en veille (les timers y sont bridés)
   * reprend au bon temps restant au lieu de rendre 30 s de sursis. Tenue par le parent plutôt
   * qu'ici : un état local disparaît au rechargement, et rendait 30 s neuves à volonté.
   */
  deadline: number
  /** Réponses déjà données (reprise après rechargement) — l'épreuve redémarre où elle en était. */
  initial: (number | null)[]
  /** Remonte la liste à chaque réponse : le parent persiste, et pose l'échéance de la suivante. */
  onAnswer: (answers: (number | null)[]) => void
  /** Rend `false` si l'enregistrement a échoué — l'écran propose alors de réessayer. */
  onDone: (answers: (number | null)[]) => Promise<boolean>
}) {
  const [index, setIndex] = useState(initial.length)
  const [now, setNow] = useState(() => Date.now())
  // Option cliquée, affichée « sélectionnée » (point rempli + fond) ~0,3 s avant d'avancer —
  // le clic reste DÉFINITIF (mécanique GLA), c'est un temps de confirmation purement visuel.
  const [chosen, setChosen] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  // Reprise avec TOUTES les réponses déjà données : `saveQi` n'était pas passé (panne réseau) —
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
      // `onAnswer` persiste la liste ET pose l'échéance de la question suivante — les deux états
      // (le nôtre, celui du parent) partent dans le même lot de rendu, donc jamais de question
      // affichée avec l'échéance périmée de la précédente.
      onAnswer(all)
      if (all.length >= questions.length) {
        void submit(all)
        return
      }
      setIndex(all.length)
    },
    [index, onAnswer, questions.length, submit],
  )

  // Un seul intervalle pour toute l'épreuve (deps vides) : il ne fait qu'avancer l'horloge, la
  // remise à zéro du chrono vient de la nouvelle `deadline` posée par le parent.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [])

  // Clic sur une option : on FIGE le choix (état sélectionné visible), puis on répond après le
  // temps de confirmation. Nettoyé au démontage — sinon `answer` tirerait sur un composant mort.
  const flash = useRef<number | null>(null)
  useEffect(() => () => { if (flash.current !== null) window.clearTimeout(flash.current) }, [])
  const pick = useCallback(
    (i: number) => {
      if (chosen !== null || answers.current.length !== index) return
      setChosen(i)
      flash.current = window.setTimeout(() => {
        setChosen(null)
        answer(i)
      }, 300)
    },
    [chosen, index, answer],
  )

  // Raccourcis clavier 1..n (badge sur chaque option — patron Questionnaire shadcn). Ignorés
  // pendant l'enregistrement / l'écran d'échec, et si un modificateur est tenu (⌘1 = onglet).
  const optCount = questions[index]?.opts.length ?? 0
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (saving || failed || e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= optCount) pick(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, failed, optCount, pick])

  // Temps écoulé = réponse `null` (compte faux) et on avance. C'est aussi ce qui traite une REPRISE
  // dont l'échéance est déjà passée : le rechargement ne rend jamais plus de temps qu'il n'en
  // restait — au pire il coûte la question en cours.
  const remaining = Math.max(0, deadline - now)
  useEffect(() => {
    // `chosen !== null` : une réponse est déjà figée, son temps de confirmation ne doit pas se
    // faire doubler par le time-out (le clic a eu lieu AVANT la fin du chrono, il compte).
    if (!saving && !failed && chosen === null && remaining <= 0) answer(null)
  }, [saving, failed, chosen, remaining, answer])

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
      {/* Patron « questionnaire » shadcn (demande du 2026-08-21) : jauge SEGMENTÉE par question
          (les questions passées + la courante sont pleines), libellé dessous, puis la question et
          ses options en lignes radio. Le chrono garde sa barre fine à part : deux jauges, deux
          sens (progression / temps restant), deux épaisseurs. */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2" aria-hidden>
          {/* Clé = l'INDEX : la liste est figée pour toute l'épreuve (jamais réordonnée), et deux
              emplacements de la banque peuvent porter le même libellé de question — depuis que
              leur nombre est libre, c'est même le cas le plus courant en dupliquant un thème. */}
          {questions.map((_, i) => (
            <span key={i} className={cn('h-1.5 flex-1 rounded-full', i <= index ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
        <div className="flex items-baseline justify-between text-sm text-muted-foreground">
          <span>
            🧠 Logique · question {index + 1} sur {questions.length}
          </span>
          {/* Les 5 dernières secondes passent au rouge (repère GLA). */}
          <span aria-live="off" className={cn('text-xs tabular-nums', seconds <= 5 && 'text-destructive')}>
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

      <p className="text-lg font-medium">{question.q}</p>

      {/* Lignes façon radio (cercle décoratif : cliquer = répondre DÉFINITIVEMENT et avancer —
          mécanique GLA, pas de « Suivant » ni de retour). `radiogroup`/`radio` pour l'a11y. */}
      {/* Lignes = recette OFFICIELLE du composant Questionnaire shadcn (classes
          `cn-questionnaire-choice` / `-indicator` / `-shortcut` du registry, arrondi aligné sur
          notre DA) : hover `muted/50`, état choisi = fond `muted` + bordure `primary/40` +
          indicateur rempli, badge du raccourci clavier à droite. */}
      <div role="radiogroup" aria-label={question.q} className="flex flex-col gap-3">
        {question.opts.map((opt, i) => (
          <button
            key={`${index}-${opt}`}
            type="button"
            role="radio"
            aria-checked={chosen === i}
            aria-keyshortcuts={String(i + 1)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border border-input bg-transparent px-4 py-3.5 text-left text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/20',
              chosen === i ? 'border-primary/40 bg-muted dark:bg-muted' : 'hover:bg-muted/50',
            )}
            onClick={() => pick(i)}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full border border-input dark:bg-input/30',
                chosen === i && 'border-primary bg-primary dark:bg-primary',
              )}
            >
              {chosen === i && <span className="size-2 rounded-full bg-primary-foreground" />}
            </span>
            <span className="flex-1">{opt}</span>
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-md border border-input bg-background font-mono text-[0.625rem] leading-none font-medium text-muted-foreground shadow-xs"
            >
              {i + 1}
            </span>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Réponds vite : à la fin du chrono, on passe automatiquement à la question suivante.
      </p>
    </div>
  )
}
