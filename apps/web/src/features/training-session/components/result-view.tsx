import { COMBO_MIN, MEDAL_BRONZE, medalFor, xpGain } from '@glagency/core'
import { cn } from '@/lib/utils'
import { CASE_KIND_LABELS, MEDAL_EMOJI, MEDAL_LABELS } from '@/lib/types/training'
import type { SessionData } from '../types'
import { ResultActions } from './result-actions'
import { AnnotatedTranscript } from './annotated-transcript'
import { ScoreGauge } from './score-gauge'
import { ScorePanel } from './score-panel'
import { SessionCelebrate } from './session-celebrate'
import { ThreadResult } from './thread-result'

/**
 * Session NOTÉE. En-tête : la note en jauge animée (`ScoreGauge`), les XP gagnés, objectif atteint /
 * plafonné à 65, record vs meilleur précédent. Solo : un ScorePanel + « ce qui était attendu » +
 * transcription. Défi / boss : une carte par conversation (ThreadResult), note globale = moyenne.
 *
 * Les XP affichés viennent de `xpGain` — la MÊME règle que la barre d'XP de Ma formation : un cas
 * ne rapporte que ce qu'il ajoute à son record. Rejouer un cas sans faire mieux affiche « +0 XP »
 * plutôt qu'un chiffre flatteur qui ne se retrouverait nulle part ensuite.
 */
export function ResultView({ data, viewerIsOwner }: { data: SessionData; viewerIsOwner: boolean }) {
  const s = data.snapshot
  const solo = data.kind === 'solo'
  const single = data.threads[0]
  const improved = data.total != null && data.previousBest != null && data.total > data.previousBest
  const medal = medalFor(data.total)
  const gain = xpGain({ total: data.total, previousBest: data.previousBest, isBoss: data.kind === 'boss' })
  // On ne fête que ce qui mérite de l'être : un cas VALIDÉ qui progresse. Un premier essai à 45/100
  // rapporte des XP (le record part de 0) sans être une réussite — pas de confettis pour ça.
  const worthCelebrating = gain > 0 && (data.total ?? 0) >= MEDAL_BRONZE
  const avgDelta =
    data.total != null && data.ownerAvgTotal != null ? Math.round(data.total - data.ownerAvgTotal) : null
  return (
    <div className="flex flex-col gap-4">
      <SessionCelebrate sessionId={data.id} total={data.total} improved={worthCelebrating} viewerIsOwner={viewerIsOwner} />

      <header className="flex flex-col gap-1">
        <p className="text-sm text-[var(--gla-muted)]">
          {s.moduleTitle} · {CASE_KIND_LABELS[data.kind]}
        </p>
        <h1 className="text-2xl font-bold tracking-[-0.3px]">{s.title}</h1>
      </header>

      {/* Bloc de note CENTRÉ (GLA `.card.center`) : la jauge, puis les verdicts empilés dessous —
          et non côte à côte. C'est l'écran qu'on découvre : tout doit tomber sous l'œil au même
          endroit, dans l'ordre où on veut le lire. */}
      <section className="gla-cardbox flex flex-col items-center gap-2 p-6 text-center">
        <ScoreGauge
          total={data.total}
          medalLabel={medal ? MEDAL_LABELS[medal] : null}
          medalEmoji={medal ? MEDAL_EMOJI[medal] : null}
          objectiveReached={data.objectiveReached}
        />

        <span className={cn('gla-pill', data.objectiveReached ? 'gla-pill-accent' : 'gla-pill-warn')}>
          {data.kind === 'boss'
            ? data.objectiveReached
              ? 'Boss réussi'
              : 'Boss non réussi'
            : data.objectiveReached
              ? `${s.objectiveLabel} atteint`
              : `${s.objectiveLabel} non atteint`}
        </span>

        {/* Cas où un média payant est en jeu : l'objectif atteint EST la vente conclue. */}
        {single?.isSale && (
          <p className={cn('text-[15px] font-extrabold', data.objectiveReached ? 'text-[var(--gla-accent)]' : 'text-[var(--gla-danger)]')}>
            {data.objectiveReached ? '💰 Il a acheté — vente conclue !' : '🚫 Il a refusé — vente ratée'}
          </p>
        )}

        {/* « vs ta moyenne » — masqué à écart nul : la moyenne inclut déjà cette session, un
            premier cas afficherait « +0 vs ta moyenne » sans rien apprendre à personne. */}
        {avgDelta != null && avgDelta !== 0 && (
          <p className={cn('text-[13px] font-extrabold', avgDelta > 0 ? 'text-[var(--gla-teal)]' : 'text-[var(--gla-warning)]')}>
            {avgDelta > 0 ? `▲ +${avgDelta}` : `▼ ${avgDelta}`}{' '}
            <span className="font-semibold text-[var(--gla-muted)]">vs ta moyenne ({Math.round(data.ownerAvgTotal!)})</span>
          </p>
        )}

        {gain > 0 && (
          <p className="text-xl font-extrabold tabular-nums text-[#c4b5fd]">
            +{gain} XP
            {data.kind === 'boss' && <span className="ml-2 text-xs font-semibold text-[var(--gla-muted)]">boss ×2</span>}
          </p>
        )}

        {improved && (
          <p className="font-extrabold text-[var(--gla-accent)]">
            🎉 Nouveau record ! {data.previousBest != null && `(avant : ${data.previousBest})`}
          </p>
        )}
        {data.combo >= COMBO_MIN && <p className="font-bold">🔥 Combo ×{data.combo}</p>}
        {solo && single?.score?.capped && <p className="text-[13px] text-[var(--gla-warning)]">Plafonné à 65</p>}
        {gain === 0 && data.previousBest != null && (
          <p className="text-[13px] text-[var(--gla-muted)]">
            Ton record tient ({data.previousBest}/100) — rejoue pour le battre.
          </p>
        )}
      </section>

      {solo && single?.score ? (
        <>
          <ScorePanel score={single.score} />
          <AnnotatedTranscript thread={single} />
          {single.score.comment && (
            <section className="gla-cardbox p-5">
              <h3 className="mb-2 text-[15px] font-bold">Débrief du coach</h3>
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed">{single.score.comment}</p>
            </section>
          )}
          {data.expected && (
            <details className="gla-cardbox p-5">
              <summary className="cursor-pointer text-[15px] font-bold">Ce qui était attendu</summary>
              <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--gla-muted)]">{data.expected}</p>
            </details>
          )}
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.threads.map((t) => (
            <ThreadResult key={t.id} thread={t} kind={data.kind} />
          ))}
        </div>
      )}

      <ResultActions data={data} viewerIsOwner={viewerIsOwner} />
    </div>
  )
}
