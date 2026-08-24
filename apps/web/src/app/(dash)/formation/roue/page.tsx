import { Suspense } from 'react'
import { hasPageAccess, requireAccess } from '@/lib/auth'
import { WheelTemplate } from '@/features/training-wheel/WheelTemplate'
import { WheelSkeleton } from '@/features/training-wheel/components/wheel-skeleton'
import { getSpinnableChatters, type SpinnableChatter } from '@/features/training-wheel/services/get-spinnable-chatters'
import { getWheel } from '@/features/training-wheel/services/get-wheel'
import { getWheelHistory } from '@/features/training-wheel/services/get-wheel-history'
import type { WheelData, WheelHistory, WheelVue } from '@/features/training-wheel/types'

const VUES: WheelVue[] = ['roue', 'historique']

/**
 * Roue des récompenses — ouverte aux deux droits de la face Formation, mais les rôles se sont
 * INVERSÉS avec la règle du 2026-08-24 : c'est l'encadrant (Suivi) qui lance la roue pour un
 * chatteur, et qui lit l'historique ; le chatteur (Entraînement) n'y voit plus que l'aperçu et ses
 * gains. Le vrai cloisonnement reste la RLS + la garde de `spinWheel` ; `canSpin` ne pilote que
 * l'affichage.
 */
export default async function RouePage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const [profile, { vue }] = await Promise.all([requireAccess(['frm-entrainement', 'frm-suivi']), searchParams])
  const isSuivi = hasPageAccess(profile, 'frm-suivi')
  // Pas de `await` ici : les requêtes partent pendant que le squelette s'affiche (streaming).
  const data = getWheel(profile.id)
  const history = isSuivi ? getWheelHistory() : null
  // La liste des cibles ne sert qu'à l'encadrant — inutile de la charger pour un chatteur.
  const chatters = isSuivi ? getSpinnableChatters() : null
  return (
    // Le `<h1>` est le titre CONFIGURABLE de la roue : il dépend de la donnée, donc il vit dans le
    // Suspense (contrairement à Ma formation, dont le titre est en dur).
    <Suspense fallback={<WheelSkeleton />}>
      <WheelContent
        data={data}
        history={history}
        chatters={chatters}
        vue={VUES.find((v) => v === vue) ?? 'roue'}
        canSpin={isSuivi}
        isAdmin={profile.role === 'admin'}
      />
    </Suspense>
  )
}

async function WheelContent({
  data,
  history,
  chatters,
  vue,
  canSpin,
  isAdmin,
}: {
  data: Promise<WheelData>
  history: Promise<WheelHistory> | null
  chatters: Promise<SpinnableChatter[]> | null
  vue: WheelVue
  canSpin: boolean
  isAdmin: boolean
}) {
  const [d, h, c] = await Promise.all([data, history, chatters])
  return <WheelTemplate data={d} history={h ?? null} chatters={c ?? []} vue={vue} canSpin={canSpin} isAdmin={isAdmin} />
}
