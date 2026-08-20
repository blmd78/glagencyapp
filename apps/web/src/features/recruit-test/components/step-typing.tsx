'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ActionButton } from '@/components/action-button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** Mesure envoyée au serveur (`saveTypingInput`) — déclarative, comme chez GLA. */
export type TypingResult = { wpm: number; accuracy: number; seconds: number }

/** Marge GLA : « J'ai terminé » s'ouvre 8 caractères avant la fin du texte. */
const NEAR_END = 8
/** Planchers GLA : évitent un wpm astronomique sur une frappe d'une fraction de seconde. */
const MIN_MINUTES_LIVE = 0.02
const MIN_MINUTES_FINAL = 0.05

const split = (s: string) => s.toLowerCase().trim().split(/\s+/).filter(Boolean)

/**
 * Vitesse de frappe — mécanique GLA reproduite : le texte est coloré mot à mot au fil de la
 * saisie, le chrono démarre à la première lettre, le compteur affiche les MOTS CORRECTS par
 * minute (pas les frappes), copier/coller/couper et le menu contextuel sont neutralisés, et
 * recopier tout le texte termine l'épreuve d'office.
 *
 * Le seuil de passage n'est ni affiché ni évalué ici : la mesure part au serveur, qui garde le
 * gate pour lui (spec §2).
 */
export function StepTyping({
  text,
  onDone,
}: {
  text: string
  /** Rend `false` si l'enregistrement a échoué — l'écran propose alors de réessayer. */
  onDone: (result: TypingResult) => Promise<boolean>
}) {
  const words = useMemo(() => split(text), [text])
  const [value, setValue] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  // Garde-fou contre la double fin (auto-fin ET clic sur le bouton dans le même instant).
  const sent = useRef(false)
  // Mesure FIGÉE au premier finish : « Réessayer » la rejoue telle quelle. La recalculer ferait
  // payer au candidat le temps passé en panne réseau (30 s d'attente = un wpm effondré).
  const measured = useRef<TypingResult | null>(null)

  useEffect(() => {
    if (startedAt === null || saving) return
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 250)
    return () => clearInterval(id)
  }, [startedAt, saving])

  const typed = split(value)
  const correct = words.reduce((n, w, i) => (typed[i] === w ? n + 1 : n), 0)
  const liveMinutes = startedAt === null ? 1 : Math.max(elapsed / 60000, MIN_MINUTES_LIVE)
  const canFinish = value.trim().length >= text.length - NEAR_END

  /**
   * Mesure calculée sur la saisie PASSÉE EN PARAMÈTRE, jamais sur l'état du rendu : l'auto-fin part
   * de `onInput`, où `value` (donc `typed`/`correct`) date encore du rendu précédent — le dernier
   * mot tapé, celui qui déclenche justement la fin, y manquerait.
   */
  function measure(source: string): TypingResult {
    const typedNow = split(source)
    const right = words.reduce((n, w, i) => (typedNow[i] === w ? n + 1 : n), 0)
    const ms = startedAt === null ? 0 : Date.now() - startedAt
    const minutes = Math.max(ms / 60000, MIN_MINUTES_FINAL)
    return {
      wpm: Math.round(right / minutes),
      // Précision = part des mots RÉELLEMENT tapés qui sont justes (0 saisie ⇒ 0).
      accuracy: typedNow.length === 0 ? 0 : Math.round((right / typedNow.length) * 1000) / 10,
      seconds: Math.max(1, Math.round(ms / 1000)),
    }
  }

  async function finish(source: string) {
    if (sent.current) return
    sent.current = true
    measured.current ??= measure(source)
    setSaving(true)
    const ok = await onDone(measured.current)
    setSaving(false)
    if (!ok) {
      sent.current = false
      setFailed(true)
    }
  }

  function onInput(next: string) {
    if (sent.current) return
    setValue(next)
    if (startedAt === null && next.length > 0) setStartedAt(Date.now())
    if (failed) setFailed(false)
    // Auto-fin GLA : tous les mots saisis ET le texte intégralement recopié.
    if (split(next).length >= words.length && next.trim().length >= text.length) void finish(next)
  }

  if (saving) return <p className="py-8 text-center text-sm text-muted-foreground">Enregistrement de ta vitesse…</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Test de vitesse de frappe</h2>
        <p className="text-sm text-muted-foreground">
          Recopie le texte ci-dessous, le plus vite et le plus juste possible. Le chrono démarre à ta première lettre.
          Le copier-coller est désactivé.
        </p>
      </div>

      <p className="rounded-md bg-muted/60 p-4 text-sm leading-7 select-none">
        {words.map((word, i) => (
          <span
            key={`${i}-${word}`}
            className={cn(
              i < typed.length && (typed[i] === word ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'),
            )}
          >
            {word}{' '}
          </span>
        ))}
      </p>

      <Textarea
        rows={3}
        autoFocus
        value={value}
        aria-label="Recopie le texte"
        placeholder="Commence à taper ici…"
        onChange={(e) => onInput(e.target.value)}
        onPaste={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      />

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>⏱ {startedAt === null ? 0 : Math.round(elapsed / 1000)} s</span>
        <span>{Math.round(correct / liveMinutes)} mots/min</span>
      </div>

      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Ta vitesse n’a pas pu être enregistrée — réessaie.
        </p>
      )}

      <ActionButton className="w-full" disabled={!canFinish} onClick={() => void finish(value)}>
        J’ai terminé
      </ActionButton>
    </div>
  )
}
