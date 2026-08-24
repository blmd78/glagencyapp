import { Podium } from '@/components/training/podium'
import { RankList, type RankListRow } from '@/components/training/rank-list'
import { MeRankModal } from './me-rank-modal'
import type { MeData, RankScope } from '../types'

const SCOPE_LABEL: Record<RankScope, string> = {
  semaine: 'cette semaine',
  'semaine-derniere': 'semaine dernière',
  global: 'général',
}

/** Socle commun aux deux RPC de classement — `RankListRow` le décrit déjà, on le réutilise. */
type Standing = RankListRow

/**
 * Podium à marches — reprise de `paintHomePodium` de l'app Good Luck Agency : 2e à gauche, 1er au
 * centre sur la marche haute avec sa couronne, 3e à droite. Un tableau à trois lignes dit la même
 * chose ; un podium la fait RESSENTIR, et c'est la comparaison sociale qui fait revenir.
 *
 * Seuls les chatteurs ayant marqué au moins un point y figurent (règle GLA) : une marche à 0 point
 * n'est pas une performance, et le classement hebdo en compterait beaucoup.
 *
 * Extrait de la MÊME liste que l'onglet Classement (`rankingScope`, une seule RPC par requête) :
 * jamais de second chargement pour trois lignes.
 */
export function MePodium({ data, myProfileId }: { data: MeData; myProfileId: string }) {
  const { rankingScope, ranking, weeklyRanking } = data
  // Le socle commun aux deux RPC (elles ne rendent pas les mêmes colonnes) — il sert au podium
  // comme au classement complet, d'où `casesDone` / `avgTotal` que le podium n'affiche pas.
  const rows: Standing[] = (rankingScope === 'global' ? ranking : (weeklyRanking ?? []))
    .map((r) => ({
      profileId: r.profileId,
      displayName: r.displayName,
      points: r.points,
      casesDone: r.casesDone,
      avgTotal: r.avgTotal,
    }))
    .filter((r) => r.points > 0)

  // Rang recalculé sur la liste FILTRÉE : `myRank` (serveur) compte aussi les 0 point, il ne
  // correspondrait pas à ce qui est affiché ici.
  const myIndex = rows.findIndex((r) => r.profileId === myProfileId)

  return (
    <section className="gla-panel">
      <h2 className="mb-[14px] flex items-center gap-2 text-[15px] font-bold">
        <span aria-hidden>🏆</span> Podium
        <span className="ml-auto text-[11.5px] font-semibold text-[var(--gla-muted)]">{SCOPE_LABEL[rankingScope]}</span>
      </h2>

      {rows.length === 0 ? (
        <div className="px-2 py-[14px] text-center text-[12.5px] leading-relaxed text-[var(--gla-muted)]">
          <div aria-hidden className="text-[30px] opacity-50">🏆</div>
          Personne n’a encore marqué de points.
          <br />
          <b className="text-[var(--gla-accent)]">Sois le premier 🔥</b>
        </div>
      ) : (
        <>
          <Podium rows={rows} myProfileId={myProfileId} />
          <p className="flex items-center justify-center gap-2 border-t border-dashed border-[var(--gla-border)] pt-1 text-[12px] font-semibold text-[var(--gla-muted)]">
            {myIndex < 0 ? (
              'Joue un cas pour marquer tes premiers points'
            ) : myIndex > 2 ? (
              <>
                Toi : <b className="text-white">#{myIndex + 1}</b> — {rows[myIndex]?.points.toLocaleString('fr-FR')} pts
              </>
            ) : (
              'Tu es sur le podium 🔥'
            )}
          </p>
        </>
      )}

      {/* `RankList` est un Server Component rendu ICI et passé en children : seul son HTML traverse,
          jamais les lignes du classement en JSON (cf. `MeRankModal`). */}
      <MeRankModal scope={rankingScope}>
        <RankList rows={rows} myProfileId={myProfileId} />
      </MeRankModal>
    </section>
  )
}
