import { Suspense } from 'react'
import { requireAdminOrManager } from '@/lib/auth'
import { ScriptsImportTemplate } from '@/features/scripts-import/ScriptsImportTemplate'
import { ScriptsImportSkeleton } from '@/features/scripts-import/components/scripts-import-skeleton'
import { getScriptsImport, type ScriptsImportData } from '@/features/scripts-import/services/get-scripts-import'

/**
 * Budget des Server Actions de cette route : préparer = lecture Notion + conversion Claude (1 à 2 min),
 * envoyer = une centaine de requêtes MyPuls, attentes de 30 puis 60 s possibles sur un 429. 800 s =
 * plafond du plan Pro (300 en Hobby : l'envoi coupé s'affiche alors « interrompu », script désactivé).
 */
export const maxDuration = 800

export default async function ImportScriptsPage({ searchParams }: { searchParams: Promise<{ import?: string; notion?: string }> }) {
  const profile = await requireAdminOrManager()
  const sp = await searchParams
  const importId = sp.import && /^[0-9a-f-]{36}$/i.test(sp.import) ? sp.import : undefined
  const data = getScriptsImport(profile, importId)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Importer un script</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Choisis un script dans le Notion de l&apos;agence : le CRM le prépare, tu relis le rapport, puis il part désactivé dans le
          Studio MyPuls de la modèle.
        </p>
      </div>
      {/* Silhouette seule : le titre et le sous-titre sont déjà affichés au-dessus (anti-CLS). */}
      <Suspense fallback={<ScriptsImportSkeleton />}>
        <ScriptsImportContent data={data} viewer={{ id: profile.id, isAdmin: profile.role === 'admin' }} notion={sp.notion} />
      </Suspense>
    </div>
  )
}

async function ScriptsImportContent({
  data,
  viewer,
  notion,
}: {
  data: Promise<ScriptsImportData>
  viewer: { id: string; isAdmin: boolean }
  notion: string | undefined
}) {
  return <ScriptsImportTemplate data={await data} viewer={viewer} notion={notion} />
}
