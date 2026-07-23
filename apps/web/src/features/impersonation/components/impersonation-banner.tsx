import { stopImpersonation } from '@/lib/impersonation/actions'
import type { ImpersonationState } from '@/features/impersonation/read-state'
import { Countdown } from './countdown'

/**
 * Bandeau permanent de consultation « en tant que » (Task 7). Server Component : ne rend
 * rien si aucune impersonation active. `state` vient de `getImpersonationState()`, chargé
 * UNE fois par `DashDynamic` (Task 9) et partagé avec `NavUser` — on ne le recharge pas ici
 * pour ne pas payer deux fois le round-trip DB pendant une consultation active.
 */
export async function ImpersonationBanner({ state: s }: { state: ImpersonationState }) {
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
