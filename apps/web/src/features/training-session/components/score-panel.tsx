import type { ThreadScore } from '../types'

/**
 * Détail d'une note (`ThreadScore`) : objectif atteint / plafond, barres par axe (25 par défaut,
 * 100 pour le boss — 6 étapes /100), moments marquants (👍 bon geste / 🔧 point à travailler +
 * indice), commentaire libre. Zéro couleur attitrée hors emoji — même barre `bg-muted`/`bg-foreground`
 * que le reste du produit.
 */
export function ScorePanel({
  score,
  objectiveLabel,
  axisMax = 25,
}: {
  score: ThreadScore
  objectiveLabel: string
  /** 25 (solo / défi) ou 100 (boss, étape /100). */
  axisMax?: 25 | 100
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">
        {score.objectiveReached ? `${objectiveLabel} atteint` : `${objectiveLabel} non atteint`}
        {score.capped && ' · plafonné à 65'}
      </p>

      {score.axes.length > 0 && (
        <div className="flex flex-col gap-2">
          {score.axes.map((a) => (
            <div key={a.key} className="flex flex-col gap-1">
              <p className="flex items-baseline justify-between text-sm">
                <span>{a.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {a.score}/{axisMax}
                </span>
              </p>
              <div className="h-2 overflow-hidden rounded bg-muted">
                <div className="h-full rounded bg-foreground" style={{ width: `${Math.min(100, (a.score / axisMax) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {score.moments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {score.moments.map((m, i) => (
            <li key={i} className="rounded-lg border p-3 text-sm">
              <p>
                {m.type === 'good' ? '👍' : '🔧'} « {m.cite} »
              </p>
              <p className="mt-1 text-muted-foreground">{m.probleme}</p>
              <p className="mt-1 text-muted-foreground">Indice : {m.indice}</p>
            </li>
          ))}
        </ul>
      )}

      {score.comment && <p className="whitespace-pre-line text-sm">{score.comment}</p>}
    </div>
  )
}
