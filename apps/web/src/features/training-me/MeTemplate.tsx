import { MeHeader } from './components/me-header'
import { MeHistory } from './components/me-history'
import { MeModules } from './components/me-modules'
import { MeRanking } from './components/me-ranking'
import { MeTabs } from './components/me-tabs'
import { MeTrophies } from './components/me-trophies'
import type { MeData, MeVue } from './types'

/**
 * « Ma formation » : en-tête (reprise + chiffres) toujours visible, puis trois vues —
 * Progression (modules + trophées), Historique, Classement. Server Component, aucun fetch.
 */
export function MeTemplate({ data, vue, myProfileId }: { data: MeData; vue: MeVue; myProfileId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <MeHeader data={data} />
      <MeTabs
        vue={vue}
        progression={
          <div className="flex flex-col gap-8">
            <MeModules data={data} />
            <MeTrophies trophies={data.trophies} />
          </div>
        }
        historique={<MeHistory sessions={data.history} />}
        classement={<MeRanking ranking={data.ranking} myProfileId={myProfileId} />}
      />
    </div>
  )
}
