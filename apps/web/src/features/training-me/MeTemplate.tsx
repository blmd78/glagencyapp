import { UrlTabs } from '@/components/url-tabs'
import { MeHeader } from './components/me-header'
import { MeHistory } from './components/me-history'
import { MeModules } from './components/me-modules'
import { MeRanking } from './components/me-ranking'
import { MeRankingSelect } from './components/me-ranking-select'
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
      <UrlTabs
        value={vue}
        defaultValue="progression"
        items={[
          {
            value: 'progression',
            label: 'Progression',
            content: (
              <div className="flex flex-col gap-8">
                <MeModules data={data} />
                <MeTrophies trophies={data.trophies} />
              </div>
            ),
          },
          { value: 'historique', label: 'Historique', content: <MeHistory sessions={data.history} /> },
          {
            value: 'classement',
            label: 'Classement',
            content: (
              <div className="flex flex-col gap-4">
                <MeRankingSelect scope={data.rankingScope} />
                <MeRanking data={data} myProfileId={myProfileId} />
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
