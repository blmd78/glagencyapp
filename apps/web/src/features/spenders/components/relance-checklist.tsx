'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { addRelance } from '../actions'
import { useSpendersOptimistic } from './spenders-optimistic-context'
import { R_ALERTE, type SpenderRow } from '../types'

/** 1..10 — une colonne par relance sur la vue tracker. */
export const R_STEPS = Array.from({ length: R_ALERTE }, (_, i) => i + 1)

/**
 * Case R{n} du tracker (DA reprise du tracker gla-workflow : carré, vert + ✓ quand fait).
 * TOUTES les cases libres sont cliquables : peu importe où le closer clique, la relance
 * s'enregistre À LA BONNE POSITION (compteurR+1) — le séquentiel et le 1/jour sont
 * garantis côté serveur (numero_r figé par addRelance + index unique jour Paris en base),
 * un clic forcé/rejoué est rejeté.
 */
export function RelanceCheck({ spender, n }: { spender: SpenderRow; n: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { apply } = useSpendersOptimistic()
  const checked = n <= spender.compteurR
  const next = spender.compteurR + 1
  const clickable = !checked && !spender.grise && !spender.archived

  const title = checked
    ? `R${n} — fait`
    : spender.grise
      ? 'Déjà relancé aujourd’hui — revient demain'
      : n === next
        ? `Cocher R${n} (1 relance max par jour)`
        : `Enregistre la relance du jour — cochera R${next}`

  return (
    <button
      type="button"
      disabled={!clickable || pending}
      title={title}
      aria-label={title}
      onClick={() =>
        startTransition(async () => {
          // Optimiste : coche + « la ligne sort de la file » À L'INSTANT du clic ; si le
          // serveur refuse, le revert automatique fait réapparaître la ligne. L'erreur
          // passe par un toast : ce composant est démonté dès le patch.
          apply({
            type: 'relance',
            creatorId: spender.creatorId,
            fanId: spender.fanId,
            at: new Date().toISOString(),
          })
          try {
            const res = await addRelance({
              creatorId: spender.creatorId,
              fanId: spender.fanId,
              chatterId: spender.chatterId,
            })
            if (res.success) return
            // Ex. « Déjà relancé aujourd'hui » (course entre deux closers / onglet resté
            // ouvert après minuit) : resynchronise la ligne au lieu de la laisser incohérente.
            toast.error(`${spender.username} : ${res.error}`)
            router.refresh()
          } catch {
            toast.error(`${spender.username} : erreur réseau — relance non enregistrée`)
          }
        })
      }
      // Mêmes cases que le tracker gla-workflow : carré 24px, vert + ✓ quand fait.
      className={cn(
        'mx-auto flex size-6 items-center justify-center rounded border transition-colors',
        checked
          ? 'border-green-500 bg-green-500/90 text-white'
          : clickable
            ? 'border-input hover:border-muted-foreground'
            : 'border-input/60 opacity-40',
      )}
    >
      {pending ? (
        <Spinner className="size-3.5" />
      ) : checked ? (
        <Check className="size-4" strokeWidth={3} />
      ) : null}
    </button>
  )
}
