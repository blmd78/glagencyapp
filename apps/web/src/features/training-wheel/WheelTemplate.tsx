import { UrlTabs } from '@/components/url-tabs'
import { MySpins } from './components/my-spins'
import { WheelConfigDialog } from './components/wheel-config-dialog'
import { WheelHistory } from './components/wheel-history'
import { WheelSpinner } from './components/wheel-spinner'
import { WheelSvg } from './components/wheel-svg'
import type { SpinnableChatter } from './services/get-spinnable-chatters'
import type { WheelData, WheelHistory as WheelHistoryData, WheelVue } from './types'

/**
 * Page Roue — Server Component, AUCUN fetch (guidelines-data-loading §3).
 *
 * Les rôles se sont INVERSÉS avec la règle du 2026-08-24 : c'est l'ENCADRANT (droit Suivi) qui
 * lance la roue, pour un chatteur qu'il choisit, en partage d'écran — et lui seul. Le chatteur
 * (droit Entraînement) ne tourne plus : il voit la roue en aperçu et ses gains. L'admin ouvre la
 * configuration.
 */
export function WheelTemplate({
  data,
  history,
  chatters,
  vue,
  canSpin,
  hasTraining,
  isAdmin,
}: {
  data: WheelData
  /** null = pas le droit Suivi (pas d'onglet Historique). */
  history: WheelHistoryData | null
  /** Chatteurs pour qui lancer — vide si le visiteur n'est pas encadrant. */
  chatters: SpinnableChatter[]
  vue: WheelVue
  /** Droit d'encadrement (`frm-suivi`) : lui seul lance un tirage. */
  canSpin: boolean
  /** Droit Entraînement : le visiteur s'entraîne, donc « Mes gains » le concerne. */
  hasTraining: boolean
  isAdmin: boolean
}) {
  const roue = (
    <div className="flex flex-col gap-8">
      {canSpin ? (
        // Props minimales : le spinner n'a que faire des 50 tirages de « Mes gains ».
        <WheelSpinner sectors={data.config.sectors} chatters={chatters} />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <WheelSvg sectors={data.config.sectors} />
          <p className="max-w-prose text-center text-sm text-muted-foreground">
            Aperçu — c’est ton encadrant qui fait tourner la roue pour toi.
          </p>
        </div>
      )}
      {/* Un encadrant qui ne s'entraîne pas n'a pas de gains : lui afficher « Mes gains — aucun
          tirage » n'aurait aucun sens. */}
      {hasTraining && <MySpins spins={data.mySpins} />}
    </div>
  )
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{data.config.title}</h1>
          <p className="text-sm text-muted-foreground">
            {canSpin ? 'Choisis un chatter et fais tourner.' : 'Ton encadrant lance la roue quand tu y as droit.'}
          </p>
        </div>
        {isAdmin && <WheelConfigDialog config={data.config} />}
      </div>
      {history ? (
        <UrlTabs
          value={vue}
          defaultValue="roue"
          items={[
            { value: 'roue', label: 'Roue', content: roue },
            { value: 'historique', label: 'Historique', content: <WheelHistory history={history} /> },
          ]}
        />
      ) : (
        roue
      )}
    </div>
  )
}
