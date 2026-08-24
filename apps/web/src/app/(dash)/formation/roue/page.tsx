import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { WheelTemplate } from '@/features/training-wheel/WheelTemplate'
import { WheelSkeleton } from '@/features/training-wheel/components/wheel-skeleton'
import { getSpinnableChatters, type SpinnableChatter } from '@/features/training-wheel/services/get-spinnable-chatters'
import { getWheel } from '@/features/training-wheel/services/get-wheel'
import { getWheelHistory } from '@/features/training-wheel/services/get-wheel-history'
import type { WheelData, WheelHistory, WheelVue } from '@/features/training-wheel/types'

const VUES: WheelVue[] = ['roue', 'historique']

/**
 * Roue des récompenses — réservée à l'ENCADREMENT (`frm-suivi`, les admins passent partout).
 *
 * Règle du 2026-08-24 : le manager ouvre la roue en partage d'écran et la fait tourner pour un
 * chatteur. Le chatteur n'a plus accès à la page — il apprend son gain de vive voix, et la trace
 * comptable vit dans l'historique. Le vrai verrou est la garde de `spinWheel` + la RLS ; cette
 * page ne fait que refuser l'entrée.
 */
export default async function RouePage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const [profile, { vue }] = await Promise.all([requireAccess('frm-suivi'), searchParams])
  // Pas de `await` ici : les requêtes partent pendant que le squelette s'affiche (streaming).
  const data = getWheel()
  const history = getWheelHistory()
  const chatters = getSpinnableChatters()
  return (
    // `.gla` : la roue est le même objet que chez Good Luck Agency — elle garde son décor, même si
    // c'est désormais l'encadrant qui la fait tourner.
    <div className="gla gla-page">
      {/* Le `<h1>` est le titre CONFIGURABLE de la roue : il dépend de la donnée, donc il vit dans
          le Suspense (contrairement à Ma formation, dont le titre est en dur). */}
      <Suspense fallback={<WheelSkeleton />}>
        <WheelContent
          data={data}
          history={history}
          chatters={chatters}
          vue={VUES.find((v) => v === vue) ?? 'roue'}
          isAdmin={profile.role === 'admin'}
        />
      </Suspense>
    </div>
  )
}

async function WheelContent({
  data,
  history,
  chatters,
  vue,
  isAdmin,
}: {
  data: Promise<WheelData>
  history: Promise<WheelHistory>
  chatters: Promise<SpinnableChatter[]>
  vue: WheelVue
  isAdmin: boolean
}) {
  const [d, h, c] = await Promise.all([data, history, chatters])
  return <WheelTemplate data={d} history={h} chatters={c} vue={vue} isAdmin={isAdmin} />
}
