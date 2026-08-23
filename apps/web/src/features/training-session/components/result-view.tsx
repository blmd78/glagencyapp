import { COMBO_MIN, MEDAL_BRONZE, medalFor, xpGain } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
    <div className="flex flex-col gap-6">
      <SessionCelebrate sessionId={data.id} total={data.total} improved={worthCelebrating} viewerIsOwner={viewerIsOwner} />
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{s.moduleTitle} · {CASE_KIND_LABELS[data.kind]}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
      </header>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-6">
          <ScoreGauge
            total={data.total}
            medalLabel={medal ? MEDAL_LABELS[medal] : null}
            medalEmoji={medal ? MEDAL_EMOJI[medal] : null}
            objectiveReached={data.objectiveReached}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {gain > 0 && (
              <p className="text-2xl font-semibold text-xp tabular-nums">
                +{gain} XP{data.kind === 'boss' && <span className="ml-2 text-sm font-normal text-muted-foreground">boss ×2</span>}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{data.kind === 'boss' ? (data.objectiveReached ? 'Boss réussi' : 'Boss non réussi') : data.objectiveReached ? `${s.objectiveLabel} atteint` : `${s.objectiveLabel} non atteint`}</Badge>
              {improved && <Badge variant="outline">🎉 Nouveau record</Badge>}
              {data.combo >= COMBO_MIN && <Badge variant="outline">🔥 Combo ×{data.combo}</Badge>}
              {solo && single?.score?.capped && <Badge variant="outline">Plafonné à 65</Badge>}
            </div>
            {/* Cas où un média payant est en jeu : l'objectif atteint EST la vente conclue. */}
            {single?.isSale && (
              <p className={cn('font-semibold', data.objectiveReached ? 'text-green-600' : 'text-red-600')}>
                {data.objectiveReached ? '💰 Vente conclue' : '🚫 Vente ratée'}
              </p>
            )}
            {/* « vs ta moyenne » — masqué à écart nul : la moyenne inclut déjà cette session, un
                premier cas afficherait « +0 vs ta moyenne » sans rien apprendre à personne. */}
            {avgDelta != null && avgDelta !== 0 && (
              <p className={cn('text-sm font-semibold', avgDelta > 0 ? 'text-green-600' : 'text-amber-600')}>
                {avgDelta > 0 ? `▲ +${avgDelta}` : `▼ ${avgDelta}`}{' '}
                <span className="font-normal text-muted-foreground">
                  vs ta moyenne ({Math.round(data.ownerAvgTotal!)})
                </span>
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {data.previousBest != null
                ? `Meilleur précédent sur ce cas : ${data.previousBest}/100`
                : 'Premier passage sur ce cas.'}
              {gain === 0 && data.previousBest != null && ' — ton record tient, rejoue pour le battre.'}
            </p>
          </div>
          <div className="ml-auto self-start"><ResultActions data={data} viewerIsOwner={viewerIsOwner} /></div>
        </CardContent>
      </Card>
      {solo && single?.score ? (
        <>
          <ScorePanel score={single.score} objectiveLabel={s.objectiveLabel} />
          {data.expected && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer text-sm font-medium">Ce qui était attendu</summary>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{data.expected}</p>
            </details>
          )}
          <AnnotatedTranscript thread={single} />
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.threads.map((t) => <ThreadResult key={t.id} thread={t} kind={data.kind} objectiveLabel={s.objectiveLabel} />)}
        </div>
      )}
    </div>
  )
}
