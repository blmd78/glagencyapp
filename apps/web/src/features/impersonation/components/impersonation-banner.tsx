import { stopImpersonation } from '@/lib/impersonation/actions'
import type { ImpersonationState } from '@/features/impersonation/services/read-state'
import { Countdown } from './countdown'

/**
 * Bandeau permanent de consultation « en tant que » (Task 7). Server Component : ne rend
 * rien si aucune impersonation active. `state` vient de `getImpersonationState()`, chargé
 * UNE fois par `DashDynamic` (Task 9) et partagé avec `NavUser` — on ne le recharge pas ici
 * pour ne pas payer deux fois le round-trip DB pendant une consultation active.
 */
export async function ImpersonationBanner({ state: s }: { state: ImpersonationState }) {
  if (!s.active) return null

  return (
    <div className="flex items-center gap-2 border-b bg-foreground px-4 py-2 text-sm text-background">
      <span>
        Consultation en tant que <strong className="font-medium">{s.targetName}</strong>
      </span>
      <span aria-hidden>·</span>
      <Countdown expiresAt={s.expiresAt!} />
      <span aria-hidden>·</span>
      <form action={stopImpersonation}>
        <button type="submit" className="underline underline-offset-2 hover:no-underline">
          Quitter
        </button>
      </form>
    </div>
  )
}
