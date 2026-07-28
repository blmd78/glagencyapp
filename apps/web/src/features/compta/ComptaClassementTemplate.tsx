import { ComptaMonthView } from './components/compta-month-view'
import { ComptaRankingView } from './components/compta-ranking-view'
import type { ComptaData, MoisData } from './types'

/**
 * Onglet CLASSEMENT — DEUX GRAINS, dans cet ordre : le récap du MOIS (le bloc de fin de mois de
 * la feuille) puis le classement setter de la PÉRIODE et son barème. Server Component, aucun
 * fetch (données en props, récupérées par `app/(dash)/chatter/compta/page.tsx`).
 *
 * IL PARTAGE `ComptaData` AVEC L'ONGLET PÉRIODE, et c'est voulu : le classement et les fiches
 * sortent du MÊME appel (`loadComptaRows`), donc de la même exécution de `rankSetters`. Un
 * chargement séparé pourrait afficher un rang que la fiche d'à côté ne connaît pas encore.
 *
 * `MoisData`, LUI, EST UN CHARGEMENT À PART (`getMois`), et c'est délibéré : il ne sert qu'à cet
 * onglet, et l'agréger dans `getCompta` l'aurait fait payer à l'onglet Période — ainsi qu'au
 * RECALCUL SERVEUR de chaque paiement, qui rejoue `loadComptaRows` fiche par fiche.
 *
 * Le récap est passé EN PROP à `ComptaRankingView` plutôt que rendu à côté : le sélecteur de
 * période vit dans ce composant client et commande les deux sections (le mois est celui du lundi
 * de départ de la période choisie). Il doit donc rester au-dessus des deux.
 */
export function ComptaClassementTemplate({
  data,
  mois,
  canConfigure,
}: {
  data: ComptaData
  mois: MoisData
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
      mois={<ComptaMonthView data={mois} />}
    />
  )
}
