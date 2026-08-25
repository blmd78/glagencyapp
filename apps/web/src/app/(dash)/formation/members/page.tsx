import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { getMembers } from '@/features/members/services/get-members'
import { MembersTemplate } from '@/features/members/MembersTemplate'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MembersData } from '@/features/members/types'

// Même DA/fonctionnement que la page Membres chatteurs et marketing, adaptée au pôle formation :
// cases = pages frm-* (Overview pour l'instant), pas de section modèles ; les droits des autres
// faces d'un profil sont préservés (fusion côté serveur, `mergePages`).
export default async function FormationMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ nouveau?: string; email?: string; nom?: string }>
}) {
  const [profile, params] = await Promise.all([requireAdmin(), searchParams])
  // « Ajouter au CRM » depuis un dossier de recrutement : le dialog s'ouvre avec l'e-mail et le nom
  // du candidat, rôle chatteur (le défaut) et la case Entraînement cochée. Passer par l'URL plutôt
  // que par un import : `recruit-admin` ne peut pas importer `members` (frontière ESLint).
  const prefill =
    params.nouveau === '1'
      ? { email: params.email ?? '', displayName: params.nom ?? '', pages: ['frm-entrainement'] }
      : undefined
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la table streame
  // dans son boundary quand la lecture répond.
  const data = getMembers()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Membres</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <MembersContent data={data} superadmin={profile.superadmin} prefill={prefill} />
      </Suspense>
    </div>
  )
}

async function MembersContent({
  data,
  superadmin,
  prefill,
}: {
  data: Promise<MembersData>
  superadmin: boolean
  prefill?: { email: string; displayName: string; pages: string[] }
}) {
  return <MembersTemplate data={await data} scope="formation" superadmin={superadmin} prefill={prefill} />
}
