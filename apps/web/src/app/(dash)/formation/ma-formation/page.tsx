import { Suspense } from 'react'
import { after } from 'next/server'
import { requireAccess } from '@/lib/auth'
import { grantTrophyTickets } from '@/lib/services/trophy-grant'
import { MeTemplate } from '@/features/training-me/MeTemplate'
import { MeSkeleton } from '@/features/training-me/components/me-skeleton'
import { getMe } from '@/features/training-me/services/get-me'
import type { MeData, MeVue, RankScope } from '@/features/training-me/types'

const VUES: MeVue[] = ['progression', 'historique', 'classement']
const SCOPES: RankScope[] = ['semaine', 'semaine-derniere', 'global']

/** Ma formation — progression, historique et classement du chatter (droit Entraînement). */
export default async function MaFormationPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; classement?: string }>
}) {
  const [profile, { vue, classement }] = await Promise.all([requireAccess('frm-entrainement'), searchParams])
  const scope = SCOPES.find((s) => s === classement) ?? 'semaine'
  // Pas de `await` ici : la requête part pendant que le squelette s'affiche (streaming).
  const data = getMe(profile.id, scope)
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
  const resolved = await data
  // `after()` : l'octroi part APRÈS la réponse — il ne retarde jamais l'affichage, et un échec ne
  // peut pas casser la page. Le tour gagné apparaît alors dans le badge « roue » de la barre
  // latérale ; le toast de félicitations, lui, est rendu côté client par `MeCelebrate`.
  after(() => grantTrophyTickets(myProfileId, resolved.trophies))
  return <MeTemplate data={resolved} vue={vue} myProfileId={myProfileId} />
}
