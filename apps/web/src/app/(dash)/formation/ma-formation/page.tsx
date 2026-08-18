import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { MeTemplate } from '@/features/training-me/MeTemplate'
import { MeSkeleton } from '@/features/training-me/components/me-skeleton'
import { getMe } from '@/features/training-me/services/get-me'
import type { MeData, MeVue } from '@/features/training-me/types'

const VUES: MeVue[] = ['progression', 'historique', 'classement']

/** Ma formation — progression, historique et classement du chatter (droit Entraînement). */
export default async function MaFormationPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const [profile, { vue }] = await Promise.all([requireAccess('frm-entrainement'), searchParams])
  // Pas de `await` ici : la requête part pendant que le squelette s'affiche (streaming).
  const data = getMe(profile.id)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ma formation</h1>
      {/* Le `<h1>` est déjà rendu ci-dessus (il ne dépend d'aucune donnée) → squelette sans titre. */}
      <Suspense fallback={<MeSkeleton withTitle={false} />}>
        <MeContent
          data={data}
          vue={VUES.find((v) => v === vue) ?? 'progression'}
          myProfileId={profile.id}
        />
      </Suspense>
    </div>
  )
}

async function MeContent({ data, vue, myProfileId }: { data: Promise<MeData>; vue: MeVue; myProfileId: string }) {
  return <MeTemplate data={await data} vue={vue} myProfileId={myProfileId} />
}
