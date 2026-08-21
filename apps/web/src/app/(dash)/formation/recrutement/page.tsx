import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { RecruitTemplate } from '@/features/recruit-admin/RecruitTemplate'
import { RecruitSkeleton } from '@/features/recruit-admin/components/recruit-skeleton'
import { getCandidate } from '@/features/recruit-admin/services/get-candidate'
import { getCandidates } from '@/features/recruit-admin/services/get-candidates'
import type { CandidateFileData, CandidatesData } from '@/features/recruit-admin/types'

/**
 * Recrutement (ADMIN — « c'est la config du lien qu'on envoie ») : la file des candidats du test
 * public, et le dossier complet de l'un d'eux via `?dossier=<id>`.
 */
export default async function RecrutementPage({ searchParams }: { searchParams: Promise<{ dossier?: string }> }) {
  const [, { dossier }] = await Promise.all([requireAdmin(), searchParams])
  // `?dossier=` validé AVANT la requête : un uuid mal formé ferait échouer Postgres (22P02) et
  // tomberait sur la boundary d'erreur au lieu d'être ignoré (précédent : Overview).
  const parsed = z.uuid().safeParse(dossier)
  const selectedId = parsed.success ? parsed.data : null

  // Kickoff SANS await : le h1 s'affiche immédiatement, les deux lectures partent en parallèle et
  // streament dans leur boundary. La file est chargée même quand un dossier est ouvert — la fiche
  // a besoin des seuils courants (gates) ; les KPIs lus au passage ne sont alors pas rendus.
  const data = getCandidates()
  const candidate = selectedId ? getCandidate(selectedId) : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Recrutement</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <RecruitSkeleton />
          </SectionFallback>
        }
      >
        <RecruitContent data={data} candidate={candidate} hasSelection={selectedId !== null} />
      </Suspense>
    </div>
  )
}

async function RecruitContent({
  data,
  candidate,
  hasSelection,
}: {
  data: Promise<CandidatesData>
  candidate: Promise<CandidateFileData | null> | null
  hasSelection: boolean
}) {
  const [list, file] = await Promise.all([data, candidate])
  // Uuid valide mais dossier inconnu (supprimé entre-temps, lien périmé) : 404 franc plutôt qu'une
  // fiche vide. Ici et pas dans la page : c'est la lecture, résolue seulement maintenant, qui sait.
  if (hasSelection && !file) notFound()
  return <RecruitTemplate data={list} candidate={file ?? null} />
}
