import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { CandidateFile } from './components/candidate-file'
import { CandidatesTable } from './components/candidates-table'
import { CopyTestLink } from './components/recruit-actions'
import type { CandidateFileData, CandidatesData, RecruitKpis } from './types'

// Liseré des cartes, dans l'ordre des KPIs : bleu (candidats), vert (validés), violet (taux), rouge (refusés).
const KPI_ACCENTS = ['border-t-blue-500', 'border-t-emerald-500', 'border-t-violet-500', 'border-t-red-500']

/** Les 4 cartes GLA : Candidats / Validés / Taux de validation / Refusés (compteurs exacts). */
function toKpis(k: RecruitKpis): Kpi[] {
  const taux = k.total > 0 ? `${Math.round((k.valide / k.total) * 100)} %` : '—'
  return [
    {
      key: 'total',
      label: 'Candidats',
      value: String(k.total),
      deltaPct: null,
      trendLabel: k.nouveau > 0 ? `${k.nouveau} à traiter` : 'File à jour',
      hint: 'dossiers soumis, tous statuts',
    },
    {
      key: 'valides',
      label: 'Validés',
      value: String(k.valide),
      deltaPct: null,
      trendLabel: '',
      hint: 'acceptés à la main',
    },
    {
      key: 'taux',
      label: 'Taux de validation',
      value: taux,
      deltaPct: null,
      trendLabel: '',
      hint: k.total > 0 ? `${k.valide} validé${k.valide > 1 ? 's' : ''} sur ${k.total}` : 'aucun dossier',
    },
    {
      key: 'refuses',
      label: 'Refusés',
      value: String(k.refuse),
      deltaPct: null,
      trendLabel: '',
      hint: 'écartés à la main',
    },
  ]
}

/**
 * Template Recrutement (admin) — Server Component, aucun fetch (guidelines-data-loading §3).
 *
 * Deux états, pas deux colonnes : `?dossier=<id>` REMPLACE la file (KPIs compris) par la fiche
 * (elle est longue — transcription comprise — et la file n'apporte rien pendant qu'on lit un
 * dossier). Retour à la liste par le lien en tête de fiche.
 */
export function RecruitTemplate({ data, candidate }: { data: CandidatesData; candidate: CandidateFileData | null }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-4 flex justify-end">
        <CopyTestLink />
      </div>
      {candidate ? (
        <CandidateFile candidate={candidate} gates={data.gates} creators={data.creators} />
      ) : (
        <>
          <KpiGrid kpis={toKpis(data.kpis)} accents={KPI_ACCENTS} />
          <CandidatesTable rows={data.rows} gates={data.gates} creators={data.creators} />
        </>
      )}
    </div>
  )
}
