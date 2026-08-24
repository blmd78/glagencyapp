import { UrlTabs } from '@/components/url-tabs'
import { WheelConfigDialog } from './components/wheel-config-dialog'
import { WheelHistory } from './components/wheel-history'
import { WheelSpinner } from './components/wheel-spinner'
import type { SpinnableChatter } from './services/get-spinnable-chatters'
import type { WheelData, WheelHistory as WheelHistoryData, WheelVue } from './types'

/**
 * Page Roue — Server Component, AUCUN fetch (guidelines-data-loading §3).
 *
 * Un seul public depuis le 2026-08-24 : l'ENCADRANT. Il choisit un chatteur, lance la roue pour lui
 * en partage d'écran, et lit l'historique de tous les tirages. Le chatteur n'a plus accès à la page
 * (il apprend son gain de vive voix) ; l'admin, qui passe partout, ouvre en plus la configuration.
 */
export function WheelTemplate({
  data,
  history,
  chatters,
  vue,
  isAdmin,
}: {
  data: WheelData
  history: WheelHistoryData
  /** Chatteurs pour qui lancer. */
  chatters: SpinnableChatter[]
  vue: WheelVue
  isAdmin: boolean
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{data.config.title}</h1>
          <p className="text-sm text-muted-foreground">Choisis un chatter et fais tourner.</p>
        </div>
        {isAdmin && <WheelConfigDialog config={data.config} />}
      </div>
      <UrlTabs
        value={vue}
        defaultValue="roue"
        items={[
          { value: 'roue', label: 'Roue', content: <WheelSpinner sectors={data.config.sectors} chatters={chatters} /> },
          { value: 'historique', label: 'Historique', content: <WheelHistory history={history} /> },
        ]}
      />
    </div>
  )
}
