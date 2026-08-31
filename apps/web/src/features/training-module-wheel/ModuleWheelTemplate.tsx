import { ModuleWheelConfigDialog } from './components/module-wheel-config-dialog'
import { ModuleWheelGains } from './components/module-wheel-gains'
import { ModuleWheelProgress } from './components/module-wheel-progress'
import { ModuleWheelSpinner } from './components/module-wheel-spinner'
import type { ModuleWheelData } from './types'

/**
 * « Ma roue » — Server Component, AUCUN fetch (guidelines-data-loading §3).
 *
 * Une seule page, pas d'onglets : le chatter a au plus 7 tours dans sa vie, tout tient à l'écran.
 * La roue en haut, ce qui reste à faire pour en gagner un de plus au milieu, ses gains en bas.
 */
export function ModuleWheelTemplate({ data, isAdmin }: { data: ModuleWheelData; isAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[30px] font-bold tracking-[-0.3px]">{data.config.title}</h1>
          <p className="text-sm text-[var(--gla-faint)]">
            {data.tours > 0
              ? `Tu as ${data.tours} tour${data.tours > 1 ? 's' : ''} à jouer.`
              : 'Termine un module pour gagner un tour.'}
          </p>
        </div>
        {isAdmin && <ModuleWheelConfigDialog config={data.config} />}
      </div>
      <ModuleWheelSpinner segments={data.config.segments} tours={data.tours} />
      <ModuleWheelProgress modules={data.modules} />
      <ModuleWheelGains spins={data.spins} totalEur={data.totalEur} />
    </div>
  )
}
