import { ScriptsView } from './components/scripts-view'
import type { ScriptsData } from './types'

/**
 * Funnel de messages d'un modèle : les membres consultent/copient (toujours la dernière
 * version — l'admin édite, revalidation immédiate), l'admin fait évoluer le script.
 */
export function ScriptsTemplate({ data, isAdmin }: { data: ScriptsData; isAdmin?: boolean }) {
  return <ScriptsView data={data} isAdmin={isAdmin} />
}
