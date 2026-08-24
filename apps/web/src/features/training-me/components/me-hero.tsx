import { nextRank, rankOf, xpLevelOf, xpOf } from '@glagency/core'
import { AnimatedNumber } from '@/components/animated-number'
import type { MeData, RankScope } from '../types'

/** Étiquette du scope affiché — sans elle, « 3e sur 6 » semblait toujours porter sur le global. */
const SCOPE_LABEL: Record<RankScope, string> = {
  semaine: 'cette semaine',
  'semaine-derniere': 'semaine dernière',
  global: 'général',
}

/**
 * L'en-tête de jeu — transposition FIDÈLE du `paintGameHero` de Good Luck Agency : tuile de rang
 * violette qui rayonne, rang en dégradé, note globale et carotte, barre d'XP lumineuse, chips.
 *
 * Deux échelles cohabitent volontairement : le NIVEAU récompense le volume (XP cumulé, il ne
 * redescend jamais) et le RANG récompense la qualité (moyenne). Un chatteur qui enchaîne les cas
 * moyens monte donc en niveau sans monter en rang — c'est exactement le signal qu'on veut lui
 * envoyer, et « plus que X pts pour passer Confirmé » lui dit quoi faire.
 *
 * Server Component : seul le compteur d'XP est une feuille client, la barre se remplit en CSS.
 */
export function MeHero({ data }: { data: MeData }) {
  const { stats, myRank, rankingScope, ranking, weeklyRanking } = data
  const xp = xpOf({ points: stats.points, bossBest: stats.bossBest })
  const lvl = xpLevelOf(xp)
  const rank = rankOf(stats.avgTotal)
  const next = nextRank(stats.avgTotal)
  // Le dénominateur suit la liste RÉELLEMENT chargée (une seule RPC par requête), jamais `ranking`.
  const rankTotal = rankingScope === 'global' ? ranking.length : (weeklyRanking?.length ?? 0)

  return (
    <section className="gla-hero">
      <div className="relative z-[1] flex flex-wrap items-center gap-[22px]">
        <div className="gla-rank grid size-[104px] flex-none place-items-center rounded-3xl text-center">
          <div>
            <div className="text-[38px] leading-none" aria-hidden>{rank.emoji}</div>
            <div className="mt-[3px] text-[10.5px] font-extrabold tracking-[1px] text-[var(--gla-gold)]">
              NIVEAU {lvl.level}
            </div>
          </div>
        </div>

        <div className="min-w-[210px] flex-1">
          <p className="text-2xl font-bold tracking-[-0.3px]">
            Rang{' '}
            <b className="bg-gradient-to-r from-[#c4b5fd] to-[#6ee7b7] bg-clip-text font-bold text-transparent">
              {rank.name}
            </b>
          </p>
          <p className="mt-0.5 text-[13px] text-[var(--gla-muted)]">
            Note globale {stats.avgTotal == null ? '—' : `${Math.round(stats.avgTotal)}/100`}
            {next && (
              <>
                {' · plus que '}
                <b className="text-[#6ee7b7]">{next.gap} pts</b>
                {` pour passer ${next.rank.name} ${next.rank.emoji}`}
              </>
            )}
            {!next && stats.avgTotal != null && ' · rang max atteint 👑'}
          </p>

          <div className="mt-[13px]">
            <div className="mb-[5px] flex justify-between text-[11px] font-bold tabular-nums text-[var(--gla-muted)]">
              <span>
                <AnimatedNumber value={xp} /> XP au total
              </span>
              <span>
                {lvl.inLevel.toLocaleString('fr-FR')} / {lvl.need.toLocaleString('fr-FR')} XP
              </span>
            </div>
            {/* `--xp-pct` en style inline : la largeur finale vaut aussi sans JS ni animation. */}
            <div
              className="gla-bar gla-bar-xp h-[11px] border border-[#2c2148]"
              role="progressbar"
              aria-valuenow={lvl.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progression vers le niveau ${lvl.level + 1}`}
            >
              <i className="xp-bar" style={{ '--xp-pct': `${lvl.pct}%` } as React.CSSProperties} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip icon="🔥" iconClass="text-[#ff8a3d]">
            Série de {stats.streakDays} {stats.streakDays > 1 ? 'jours' : 'jour'}
          </Chip>
          {myRank != null && rankTotal > 0 && (
            <Chip icon="🏆" iconClass="text-[var(--gla-gold)]">
              #{myRank} sur {rankTotal}
              <span className="font-semibold text-[var(--gla-faint)]"> · {SCOPE_LABEL[rankingScope]}</span>
            </Chip>
          )}
          <Chip icon="✅" iconClass="text-[var(--gla-accent)]">
            {stats.casesDone}/{data.totalCases} cas validés
          </Chip>
        </div>
      </div>
    </section>
  )
}

function Chip({ icon, iconClass, children }: { icon: string; iconClass: string; children: React.ReactNode }) {
  return (
    <span className="gla-chip flex items-center gap-2 whitespace-nowrap px-[14px] py-[9px] text-[12.5px] font-bold tabular-nums">
      <b aria-hidden className={`text-base ${iconClass}`}>{icon}</b>
      {children}
    </span>
  )
}
