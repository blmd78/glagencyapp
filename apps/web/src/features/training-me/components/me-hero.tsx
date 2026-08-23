import { nextRank, rankOf, xpLevelOf, xpOf } from '@glagency/core'
import { AnimatedNumber } from '@/components/animated-number'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { MeData, RankScope } from '../types'

/** Étiquette du scope affiché — sans elle, « 3e sur 6 » semblait toujours porter sur le global. */
const SCOPE_LABEL: Record<RankScope, string> = {
  semaine: 'cette semaine',
  'semaine-derniere': 'semaine dernière',
  global: 'général',
}

/**
 * L'en-tête « jeu » de Ma formation : rang, niveau et barre d'XP — repris de l'app Good Luck Agency
 * d'origine (`paintGameHero`), formules comprises (`@glagency/core/training/levels`).
 *
 * Deux échelles cohabitent volontairement : le NIVEAU récompense le volume (XP cumulé, il ne
 * redescend jamais) et le RANG récompense la qualité (moyenne). Un chatter qui enchaîne les cas
 * moyens monte donc en niveau sans monter en rang — c'est exactement le signal qu'on veut lui
 * envoyer, et la phrase « plus que X pts pour passer Confirmé » lui dit quoi faire.
 *
 * Server Component : seul le compteur d'XP est une feuille client (`AnimatedNumber`), la barre se
 * remplit en CSS.
 */
export function MeHero({ data }: { data: MeData }) {
  const { stats, myRank, rankingScope, ranking, weeklyRanking } = data
  const xp = xpOf({ points: stats.points, bossBest: stats.bossBest })
  const lvl = xpLevelOf(xp)
  const rank = rankOf(stats.avgTotal)
  const next = nextRank(stats.avgTotal)
  // Le dénominateur suit la liste RÉELLEMENT chargée (une seule RPC par requête), jamais `ranking` en dur.
  const rankTotal = rankingScope === 'global' ? ranking.length : (weeklyRanking?.length ?? 0)

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex size-24 flex-none flex-col items-center justify-center gap-1 rounded-2xl border-2 border-xp/30 bg-xp-soft">
          <span aria-hidden className="text-4xl leading-none">{rank.emoji}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-xp">Niveau {lvl.level}</span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Rang <span className="text-xp">{rank.name}</span>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Note globale {stats.avgTotal == null ? '—' : `${Math.round(stats.avgTotal)}/100`}
              {next && (
                <>
                  {' · plus que '}
                  <span className="font-semibold text-foreground">{next.gap} pts</span>
                  {` pour passer ${next.rank.name} ${next.rank.emoji}`}
                </>
              )}
              {!next && stats.avgTotal != null && ' · rang max atteint 👑'}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex justify-between text-xs font-semibold text-muted-foreground tabular-nums">
              <span>
                <AnimatedNumber value={xp} /> XP au total
              </span>
              <span>
                {lvl.inLevel.toLocaleString('fr-FR')} / {lvl.need.toLocaleString('fr-FR')} XP
              </span>
            </div>
            <Progress
              value={lvl.pct}
              animated
              className="h-2.5"
              indicatorClassName="bg-xp"
              label={`Progression vers le niveau ${lvl.level + 1}`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1.5 px-2.5 py-1.5 text-xs tabular-nums">
              <span aria-hidden>🔥</span> Série de {stats.streakDays} {stats.streakDays > 1 ? 'jours' : 'jour'}
            </Badge>
            {myRank != null && rankTotal > 0 && (
              <Badge variant="outline" className="gap-1.5 px-2.5 py-1.5 text-xs tabular-nums">
                <span aria-hidden>🏆</span> #{myRank} sur {rankTotal}
                <span className="font-normal text-muted-foreground">{SCOPE_LABEL[rankingScope]}</span>
              </Badge>
            )}
            <Badge variant="outline" className="gap-1.5 px-2.5 py-1.5 text-xs tabular-nums">
              <span aria-hidden>✅</span> {stats.casesDone}/{data.totalCases} cas validés
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
