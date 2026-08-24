import Link from 'next/link'
import { Podium } from '@/components/training/podium'
import type { MeData, RankScope } from '../types'

const SCOPE_LABEL: Record<RankScope, string> = {
  semaine: 'cette semaine',
  'semaine-derniere': 'semaine dernière',
  global: 'général',
}

type Standing = { profileId: string; displayName: string; points: number }

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
  const rows: Standing[] = (rankingScope === 'global' ? ranking : (weeklyRanking ?? []))
    .map((r) => ({ profileId: r.profileId, displayName: r.displayName, points: r.points }))
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

      <Link
        href="/formation/ma-formation?vue=classement"
        className="gla-link mt-3 flex w-full items-center justify-center gap-1.5 p-[11px] text-[12.5px] font-bold"
      >
        Voir le classement complet →
      </Link>
    </section>
  )
}
