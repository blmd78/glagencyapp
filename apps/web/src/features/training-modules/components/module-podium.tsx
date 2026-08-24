import { Podium } from '@/components/training/podium'
import type { ModuleRankRow } from '../services/get-module-ranking'

/**
 * Le top 3 DE CE MODULE, visible dès l'ouverture — sans changer d'onglet. Un classement général
 * ne dit pas grand-chose à quelqu'un qui vient travailler la négociation ; savoir qui domine LE
 * module qu'on ouvre, si.
 *
 * Les 0 point sont déjà écartés côté SQL : une marche à zéro n'est pas une performance.
 */
export function ModulePodium({ rows, myProfileId }: { rows: ModuleRankRow[]; myProfileId: string }) {
  if (rows.length === 0) {
    return (
      <section className="gla-panel px-2 py-[14px] text-center text-[12.5px] leading-relaxed text-[var(--gla-muted)]">
        <div aria-hidden className="text-[30px] opacity-50">🏆</div>
        Personne n’a encore marqué de points sur ce module.
        <br />
        <b className="text-[var(--gla-accent)]">Sois le premier 🔥</b>
      </section>
    )
  }
  const myIndex = rows.findIndex((r) => r.profileId === myProfileId)
  return (
    <section className="gla-panel">
      <h2 className="mb-[14px] flex items-center gap-2 text-[15px] font-bold">
        <span aria-hidden>🏆</span> Top 3 du module
      </h2>
      <Podium rows={rows} myProfileId={myProfileId} />
      <p className="flex items-center justify-center gap-2 border-t border-dashed border-[var(--gla-border)] pt-1 text-[12px] font-semibold text-[var(--gla-muted)]">
        {myIndex < 0 ? (
          'Joue un cas de ce module pour entrer au classement'
        ) : myIndex > 2 ? (
          <>
            Toi : <b className="text-white">#{myIndex + 1}</b> — {rows[myIndex]?.points.toLocaleString('fr-FR')} pts
          </>
        ) : (
          'Tu es sur le podium 🔥'
        )}
      </p>
    </section>
  )
}
