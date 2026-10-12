import { NotionConnectionCard } from './components/notion-connection.client'
import { ScriptPicker } from './components/script-picker.client'
import { ImportReport } from './components/import-report.client'
import { ImportsTable } from './components/imports-table.client'
import type { ScriptsImportData } from './services/get-scripts-import'

/**
 * Écran « Importer un script » (Server Component) : connexion Notion (chacun le sien, 0192), choix du
 * script et de la modèle, rapport de l'import en cours, historique. Les gestes sont dans les feuilles client.
 */
export function ScriptsImportTemplate({
  data,
  viewer,
  notion,
}: {
  data: ScriptsImportData
  viewer: { id: string; isAdmin: boolean }
  notion: string | undefined
}) {
  const ready = data.workspaces.length > 0
  return (
    <div className="flex flex-col gap-6">
      <NotionConnectionCard connections={data.connections} notion={notion} isAdmin={viewer.isAdmin} />

      {data.current && <ImportReport current={data.current} viewerId={viewer.id} />}

      {ready && <ScriptPicker workspaces={data.workspaces} creators={data.creators} />}

      <ImportsTable imports={data.imports} />
    </div>
  )
}
