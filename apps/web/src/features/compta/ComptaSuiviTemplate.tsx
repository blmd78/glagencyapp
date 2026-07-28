import { ComptaSuiviView } from './components/compta-suivi-view'
import type { SuiviData } from './types'

/**
 * Onglet SUIVI — primes d'embauche échues et soldes des partants. Server Component, aucun fetch
 * (données en props via `getSuivi`, appelé par la page).
 *
 * SON PROPRE CONTRAT DE DONNÉES (`SuiviData`), et non `ComptaData` : rien ici ne dépend d'une
 * période, et la page ne charge donc PAS la compta d'une quinzaine quand c'est cet onglet qui est
 * demandé — une dizaine de requêtes, dont plusieurs `fetchAll`, économisées à chaque affichage.
 */
export function ComptaSuiviTemplate({
  data,
  canConfigure,
}: {
  data: SuiviData
  /** ADMIN seul — les soldes des partants (`compta_debts`, spec §6). */
  canConfigure: boolean
}) {
  return <ComptaSuiviView data={data} canConfigure={canConfigure} />
}
