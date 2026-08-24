import { rankOf, rankTier, xpLevelOf, xpOf } from '@glagency/core'
import { MeCelebrate } from './components/me-celebrate'
import { MeHero } from './components/me-hero'
import { MeHistoryModal } from './components/me-history-modal'
import { MeModules } from './components/me-modules'
import { MeNext } from './components/me-next'
import { MePodium } from './components/me-podium'
import { MeTrophies } from './components/me-trophies'
import type { MeData } from './types'

/**
 * « Ma formation » — structure de l'app Good Luck Agency (`render.formationHome`) : en-tête de jeu,
 * bandeau d'objectif, puis DEUX COLONNES (modules à gauche ; podium et trophées à droite).
 *
 * Aucun onglet, volontairement : GLA tient tout sur un écran, et le classement complet comme
 * l'historique s'ouvrent en modale depuis leur panneau. Les onglets qu'on avait obligeaient à
 * naviguer pour voir son classement — le podium sous les yeux en permanence est précisément ce qui
 * fait revenir.
 *
 * Server Component, aucun fetch. XP, niveau et rang se DÉDUISENT des chiffres déjà chargés
 * (`points`, `boss_best`, `avg_total`) : rien de nouveau n'est lu ni stocké pour la couche jeu.
 */
export function MeTemplate({ data, myProfileId }: { data: MeData; myProfileId: string }) {
  const level = xpLevelOf(xpOf({ points: data.stats.points, bossBest: data.stats.bossBest })).level
  const rank = rankOf(data.stats.avgTotal)
  // Le trophée fait foi pour « tout le catalogue » — une seule règle, jamais recalculée à côté.
  const allDone = data.trophies.some((t) => t.key === 'all_done' && t.earned)

  return (
    <div className="flex flex-col gap-4">
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
      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <MeModules data={data} />
        <div className="flex flex-col gap-4">
          <MePodium data={data} myProfileId={myProfileId} />
          <MeTrophies trophies={data.trophies} />
          <MeHistoryModal sessions={data.history} />
        </div>
      </div>
    </div>
  )
}
