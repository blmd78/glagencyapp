import { stopImpersonation } from '@/features/impersonation/actions'
import { getImpersonationState } from '@/features/impersonation/read-state'
import { Countdown } from './countdown'

/**
 * Bandeau permanent de consultation « en tant que » (Task 7). Server Component : ne rend
 * rien si aucune impersonation active (coût nul — voir `getImpersonationState`). Monté une
 * fois dans le layout `(dash)`, visible sur toutes les pages tant que la consultation dure.
 */
export async function ImpersonationBanner() {
  const s = await getImpersonationState()
  if (!s.active) return null

  // Wrapper local : `stopImpersonation` retourne `Promise<ActionResult>` (contrat partagé
  // avec le Route Handler / d'éventuels appelants programmatiques), mais `<form action>`
  // exige `(formData) => void | Promise<void>`. `stopImpersonation` redirige TOUJOURS
  // (succès ou fallback fullLogout) donc ne "retourne" jamais vraiment — ce wrapper ne fait
  // qu'aligner le type, sans changer le comportement.
  async function stop() {
    'use server'
    await stopImpersonation()
  }

  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <span>
        Consultation en tant que <strong className="font-medium">{s.targetName}</strong>
      </span>
      <span aria-hidden>·</span>
      <Countdown expiresAt={s.expiresAt!} />
      <span aria-hidden>·</span>
      <form action={stop}>
        <button type="submit" className="underline underline-offset-2 hover:no-underline">
          Quitter
        </button>
      </form>
    </div>
  )
}
