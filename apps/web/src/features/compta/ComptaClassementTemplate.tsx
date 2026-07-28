import { ComptaRankingView } from './components/compta-ranking-view'
import type { ComptaData } from './types'

/**
 * Onglet CLASSEMENT — le TOP setter de la période et son barème. Server Component, aucun fetch
 * (données en props, récupérées par `app/(dash)/chatter/compta/page.tsx`).
 *
 * IL PARTAGE `ComptaData` AVEC L'ONGLET PÉRIODE, et c'est voulu : le classement et les fiches
 * sortent du MÊME appel (`loadComptaRows`), donc de la même exécution de `rankSetters`. Un
 * chargement séparé pourrait afficher un rang que la fiche d'à côté ne connaît pas encore.
 */
export function ComptaClassementTemplate({
  data,
  canConfigure,
}: {
  data: ComptaData
  /** ADMIN seul — l'édition du barème. Distinct de `canPay` et de `canEnter` (spec §6). */
  canConfigure: boolean
}) {
  return (
    <ComptaRankingView
      ranking={data.setterRanking}
      scale={data.setterScale}
      period={data.period}
      choices={data.choices}
      canConfigure={canConfigure}
    />
  )
}
