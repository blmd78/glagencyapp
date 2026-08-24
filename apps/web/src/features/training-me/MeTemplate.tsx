import { rankOf, rankTier, xpLevelOf, xpOf } from '@glagency/core'
import { UrlTabs } from '@/components/url-tabs'
import { MeCelebrate } from './components/me-celebrate'
import { MeHero } from './components/me-hero'
import { MeHistory } from './components/me-history'
import { MeModules } from './components/me-modules'
import { MeNext } from './components/me-next'
import { MePodium } from './components/me-podium'
import { MeRanking } from './components/me-ranking'
import { MeRankingSelect } from './components/me-ranking-select'
import { MeTrophies } from './components/me-trophies'
import type { MeData, MeVue } from './types'

/**
 * « Ma formation ». En-tête de jeu (rang, niveau, XP) et prochain objectif toujours visibles, puis
 * trois vues — Progression (modules d'un côté, podium et trophées de l'autre), Historique,
 * Classement. Server Component, aucun fetch.
 *
 * XP, niveau et rang se DÉDUISENT des chiffres déjà chargés (`points`, `boss_best`, `avg_total`) :
 * rien de nouveau n'est lu ni stocké pour la couche jeu.
 */
export function MeTemplate({ data, vue, myProfileId }: { data: MeData; vue: MeVue; myProfileId: string }) {
  const level = xpLevelOf(xpOf({ points: data.stats.points, bossBest: data.stats.bossBest })).level
  const rank = rankOf(data.stats.avgTotal)
  // Le trophée fait foi pour « tout le catalogue » — une seule règle, jamais recalculée à côté.
  const allDone = data.trophies.some((t) => t.key === 'all_done' && t.earned)

  return (
    <div className="flex flex-col gap-6">
      <MeCelebrate
        profileId={myProfileId}
        level={level}
        rankTier={rankTier(data.stats.avgTotal)}
        rankName={rank.name}
        rankEmoji={rank.emoji}
        allDone={allDone}
        myRank={data.myRank}
        trophies={data.trophies.filter((t) => t.earned).map((t) => ({ key: t.key, label: t.label }))}
      />
      <MeHero data={data} />
      <MeNext data={data} />
      <UrlTabs
        value={vue}
        defaultValue="progression"
        items={[
          {
            value: 'progression',
            label: 'Progression',
            content: (
              <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
                <MeModules data={data} />
                <div className="flex flex-col gap-4">
                  <MePodium data={data} myProfileId={myProfileId} />
                  <MeTrophies trophies={data.trophies} />
                </div>
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
