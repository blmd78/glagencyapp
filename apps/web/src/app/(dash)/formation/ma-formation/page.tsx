import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { MeTemplate } from '@/features/training-me/MeTemplate'
import { MeSkeleton } from '@/features/training-me/components/me-skeleton'
import { getMe } from '@/features/training-me/services/get-me'
import type { MeData, RankScope } from '@/features/training-me/types'

const SCOPES: RankScope[] = ['semaine', 'semaine-derniere', 'global']

/** Ma formation — progression, historique et classement du chatter (droit Entraînement). */
export default async function MaFormationPage({
  searchParams,
}: {
  searchParams: Promise<{ classement?: string }>
}) {
  const [profile, { classement }] = await Promise.all([requireAccess('frm-entrainement'), searchParams])
  const scope = SCOPES.find((s) => s === classement) ?? 'semaine'
  // Pas de `await` ici : la requête part pendant que le squelette s'affiche (streaming).
  const data = getMe(profile.id, scope)
  return (
    // `.gla` = thème repris de l'app Good Luck Agency (cf. `formation-theme.css`) : les chatteurs
    // formés là-bas doivent retrouver leur écran, pas découvrir un design de CRM.
    <div className="gla flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-[-0.3px]">Ma formation</h1>
      {/* Le `<h1>` est déjà rendu ci-dessus (il ne dépend d'aucune donnée) → squelette sans titre. */}
      <Suspense fallback={<MeSkeleton withTitle={false} />}>
        <MeContent data={data} myProfileId={profile.id} />
      </Suspense>
    </div>
  )
}

async function MeContent({ data, myProfileId }: { data: Promise<MeData>; myProfileId: string }) {
  return <MeTemplate data={await data} myProfileId={myProfileId} />
}
