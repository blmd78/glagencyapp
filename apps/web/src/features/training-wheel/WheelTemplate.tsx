import { MySpins } from './components/my-spins'
import { WheelConfigDialog } from './components/wheel-config-dialog'
import { WheelHistory } from './components/wheel-history'
import { WheelSpinner } from './components/wheel-spinner'
import { WheelSvg } from './components/wheel-svg'
import { WheelTabs } from './components/wheel-tabs'
import type { WheelData, WheelHistory as WheelHistoryData, WheelVue } from './types'

/**
 * Page Roue — Server Component, AUCUN fetch (guidelines-data-loading §3). Trois publics dans une
 * seule page : le chatter (droit Entraînement) tourne la roue et voit ses gains ; l'encadrant
 * (droit Suivi) gagne l'onglet Historique — `history` non nul EST le signal ; l'admin ouvre la
 * configuration. Un encadrant SANS droit Entraînement n'a pas de bouton : il voit la roue en
 * aperçu, c'est tout.
 */
export function WheelTemplate({
  data,
  history,
  vue,
  canSpin,
  isAdmin,
}: {
  data: WheelData
  /** null = pas le droit Suivi (pas d'onglet Historique). */
  history: WheelHistoryData | null
  vue: WheelVue
  canSpin: boolean
  isAdmin: boolean
}) {
  const roue = (
    <div className="flex flex-col gap-8">
      {canSpin ? (
        <WheelSpinner data={data} />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <WheelSvg sectors={data.config.sectors} />
          <p className="text-center text-sm text-muted-foreground">Aperçu — le tirage est réservé aux chatters (droit Entraînement).</p>
        </div>
      )}
      {canSpin && <MySpins spins={data.mySpins} />}
    </div>
  )
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{data.config.title}</h1>
          <p className="text-sm text-muted-foreground">Top 3 du classement de la semaine = un tour.</p>
        </div>
        {isAdmin && <WheelConfigDialog config={data.config} />}
      </div>
      {history ? <WheelTabs vue={vue} roue={roue} historique={<WheelHistory history={history} />} /> : roue}
    </div>
  )
}
