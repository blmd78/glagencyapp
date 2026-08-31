import { BOSS_UNLOCK_AVG } from '@glagency/core'
import Link from 'next/link'
import { ModuleCard } from '@/components/training/module-card'
import { ScoreBadge } from '@/components/training/score-badge'
import type { MeData } from '../types'

/**
 * « Tes modules » — transposition du panneau GLA (`paintModules` / `.apanel` + `.amcard`) : une
 * carte par module, tuile emoji à gauche, pourcentage en vert à droite, barre dégradée dessous.
 *
 * Le boss final se lit à part : il ne compte pas dans la progression des modules (verrouillé sous
 * 60/100 de moyenne, sinon son meilleur essai).
 */
export function MeModules({ data }: { data: MeData }) {
  const { modules, stats, bossUnlocked: unlocked, totalCases } = data
  return (
    <section className="gla-panel">
      <h2 className="mb-[14px] flex items-center gap-2 text-[15px] font-bold">
        <span aria-hidden>⚔️</span> Tes modules
        <span className="ml-auto text-[11.5px] font-semibold tabular-nums text-[var(--gla-muted)]">
          {stats.casesDone}/{totalCases} cas validés
        </span>
      </h2>

      {modules.length === 0 ? (
        <p className="py-[14px] text-center text-[12.5px] text-[var(--gla-muted)]">
          Aucun module ne t’a encore été attribué.
        </p>
      ) : (
        <ul className="flex flex-col gap-[9px]">
          {/* Carte PARTAGÉE avec « Ma roue » (`components/training/module-card`) : les deux écrans
              affichent le même module, ils doivent afficher les mêmes chiffres. */}
          {modules.map((m) => (
            <ModuleCard key={m.id} code={m.code} title={m.title} emoji={m.emoji} progress={m.progress} />
          ))}
        </ul>
      )}

      <div className="mt-[9px] flex flex-col gap-2 rounded-[14px] border border-[var(--gla-border)] bg-[var(--gla-surface2)] p-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-bold">
            <span aria-hidden className="mr-1.5">🏆</span> Boss final
          </h3>
          {unlocked && <ScoreBadge total={stats.bossBest} />}
          {!unlocked && <span className="text-xs text-[var(--gla-muted)]">🔒 verrouillé</span>}
        </div>
        <p className="text-[11.5px] leading-relaxed text-[var(--gla-muted)]">
          {unlocked
            ? stats.bossDone
              ? 'Réussi — tu peux le refaire pour améliorer ta note.'
              : 'Débloqué : 5 conversations en même temps, une seule tentative à la fois.'
            : `Se débloque à ${BOSS_UNLOCK_AVG}/100 de moyenne (actuelle : ${stats.avgTotal == null ? '—' : Math.round(stats.avgTotal)}).`}
        </p>
        {/* Le boss se joue depuis SON module (avec ses 5 fans) : sans ce lien, un chatteur débloqué
            n'a aucun chemin vers lui depuis Ma formation. */}
        <Link href="/formation/modules" className="w-fit text-[12px] font-bold text-[var(--gla-accent)] hover:underline">
          Voir les modules →
        </Link>
      </div>
    </section>
  )
}
