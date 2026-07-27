import { ComptaView } from './components/compta-view'
import type { ComptaData } from './types'

/**
 * Compta — paie des chatteurs par quinzaine. Server Component, aucun fetch (données en props,
 * récupérées par `app/(dash)/chatter/compta/page.tsx`). Toute l'interactivité vit dans
 * `ComptaView` : sélecteur de période, pile de noms, saisies et paiement.
 */
export function ComptaTemplate({ data, canPay }: { data: ComptaData; canPay: boolean }) {
  return <ComptaView data={data} canPay={canPay} />
}
