import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { CandidateFile } from './components/candidate-file'
import { CandidatesTable } from './components/candidates-table'
import { IntegrationsView } from './components/integrations-view'
import { UrlTabs } from '@/components/url-tabs'
import { CopyTestLink } from './components/recruit-actions'
import type { CandidateFileData, CandidatesData, RecruitKpis } from './types'

// Liseré des cartes, dans l'ordre des KPIs : bleu (candidats), vert (validés), violet (taux), rouge (refusés).
const KPI_ACCENTS = ['border-t-blue-500', 'border-t-emerald-500', 'border-t-violet-500', 'border-t-red-500']

/**
 * Les 4 cartes de l'ENTONNOIR : reçus → ont réussi le test → devenus membres → entrés ce mois.
 *
 * Remplacent Candidats / Validés / Taux / Refusés le 2026-09-09. Les 195 dossiers sont tous en
 * statut « nouveau » — le workflow valider/refuser n'a jamais servi — et deux cartes sur quatre
 * affichaient donc 0 en permanence, la troisième un taux de 0 %.
 *
 * L'écart entre « ont réussi » et « devenus membres » est VOULU à l'écran : 25 réussites pour
 * 77 comptes créés. Le test ne décide pas qui entre, et la carte le dit.
 */
function toKpis(k: RecruitKpis): Kpi[] {
  const tauxTest = k.total > 0 ? `${Math.round((k.passed / k.total) * 100)} %` : '—'
  return [
    {
      key: 'total',
      label: 'Dossiers reçus',
      value: String(k.total),
      deltaPct: null,
      trendLabel: '',
      hint: 'toutes sessions confondues',
    },
    {
      key: 'passed',
      label: 'Ont réussi le test',
      value: String(k.passed),
      deltaPct: null,
      trendLabel: '',
      hint: `${tauxTest} des dossiers`,
    },
    {
      key: 'members',
      label: 'Devenus membres',
      value: String(k.members),
      deltaPct: null,
      trendLabel: '',
      hint: 'un compte a été créé',
    },
    {
      key: 'integres',
      label: 'Entrés ce mois',
      value: String(k.integratedThisMonth),
      deltaPct: null,
      trendLabel: '',
      hint: 'rattachés à une modèle',
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
export function RecruitTemplate({
  data,
  candidate,
  isAdmin,
  vue,
}: {
  data: CandidatesData
  candidate: CandidateFileData | null
  isAdmin: boolean
  /** Onglet actif, validé par la page (`?vue=`). */
  vue: string
}) {
  const total = data.integrations.reduce((n, m) => n + m.rows.length, 0)
  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-4 flex justify-end">
        <CopyTestLink />
      </div>
      {candidate ? (
        <CandidateFile candidate={candidate} gates={data.gates} isAdmin={isAdmin} />
      ) : (
        <>
          <KpiGrid kpis={toKpis(data.kpis)} accents={KPI_ACCENTS} />
          {/* Deux lectures, deux onglets : juger des dossiers (par session de test) et suivre
              les entrées (par mois) ne se regardent pas au même rythme. */}
          <UrlTabs
            value={vue}
            defaultValue="dossiers"
            items={[
              {
                value: 'dossiers',
                label: 'Dossiers',
                content: <CandidatesTable days={data.days} gates={data.gates} />,
              },
              {
                value: 'integrations',
                label: (
                  <span className="flex items-center gap-1.5">
                    Intégrations
                    {total > 0 && <span className="tabular-nums opacity-60">{total}</span>}
                  </span>
                ),
                content: <IntegrationsView months={data.integrations} />,
              },
            ]}
          />
        </>
      )}
    </div>
  )
}
