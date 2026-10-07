import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NotionConnectionCard } from './components/notion-connection.client'
import { ScriptPicker } from './components/script-picker.client'
import { ImportReport } from './components/import-report.client'
import { ImportsTable } from './components/imports-table.client'
import type { ScriptsImportData } from './services/get-scripts-import'

/**
 * Écran « Importer un script » (Server Component) : connexion Notion (admin), choix du script et de la
 * modèle, rapport de l'import en cours, historique. Les gestes sont dans les feuilles client.
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
  const ready = !!data.connection?.rootPageId
  return (
    <div className="flex flex-col gap-6">
      {viewer.isAdmin ? (
        <NotionConnectionCard connection={data.connection} rootCandidates={data.rootCandidates} notion={notion} />
      ) : (
        !ready && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notion n&apos;est pas connecté</CardTitle>
              <CardDescription>Demande à un admin de connecter le Notion de l&apos;agence.</CardDescription>
            </CardHeader>
          </Card>
        )
      )}

      {data.notionError && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">Lecture Notion impossible : {data.notionError}</CardContent>
        </Card>
      )}

      {data.current && <ImportReport current={data.current} viewerId={viewer.id} />}

      {ready && (
        <ScriptPicker folders={data.folders} creators={data.creators} />
      )}

      <ImportsTable imports={data.imports} />
    </div>
  )
}
