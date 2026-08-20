import { CandidateFile } from './components/candidate-file'
import { CandidatesTable } from './components/candidates-table'
import { CopyTestLink } from './components/recruit-actions'
import type { CandidateFileData, CandidatesData } from './types'

/**
 * Template Recrutement (admin) — Server Component, aucun fetch (guidelines-data-loading §3).
 *
 * Deux états, pas deux colonnes : `?dossier=<id>` REMPLACE la file par la fiche (elle est longue —
 * transcription comprise — et la file n'apporte rien pendant qu'on lit un dossier). Retour à la
 * liste par le lien en tête de fiche.
 */
export function RecruitTemplate({ data, candidate }: { data: CandidatesData; candidate: CandidateFileData | null }) {
  const pending = data.rows.filter((r) => r.status === 'nouveau').length
  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data.rows.length} candidat{data.rows.length > 1 ? 's' : ''}
          {pending > 0 && ` · ${pending} à traiter`}
        </p>
        <CopyTestLink />
      </div>
      {candidate ? (
        <CandidateFile candidate={candidate} gates={data.gates} />
      ) : (
        <CandidatesTable rows={data.rows} gates={data.gates} />
      )}
    </div>
  )
}
