import { Suspense } from 'react'
import { hasPageAccess, requireAccess } from '@/lib/auth'
import { WheelTemplate } from '@/features/training-wheel/WheelTemplate'
import { WheelSkeleton } from '@/features/training-wheel/components/wheel-skeleton'
import { getWheel } from '@/features/training-wheel/services/get-wheel'
import { getWheelHistory } from '@/features/training-wheel/services/get-wheel-history'
import type { WheelData, WheelHistory, WheelVue } from '@/features/training-wheel/types'

const VUES: WheelVue[] = ['roue', 'historique']

/**
 * Roue des récompenses — ouverte aux deux droits de la face Formation : le chatter (Entraînement)
 * y joue son tour, l'encadrant (Suivi) y lit l'historique. Le vrai cloisonnement reste la RLS
 * (`training_wheel_*`) : `canSpin` / `history` ne pilotent que l'affichage.
 */
export default async function RouePage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const [profile, { vue }] = await Promise.all([requireAccess(['frm-entrainement', 'frm-suivi']), searchParams])
  const canSpin = hasPageAccess(profile, 'frm-entrainement')
  const isSuivi = hasPageAccess(profile, 'frm-suivi')
  // Pas de `await` ici : les requêtes partent pendant que le squelette s'affiche (streaming).
  const data = getWheel(profile.id)
  const history = isSuivi ? getWheelHistory() : null
  return (
    // Le `<h1>` est le titre CONFIGURABLE de la roue : il dépend de la donnée, donc il vit dans le
    // Suspense (contrairement à Ma formation, dont le titre est en dur).
    <Suspense fallback={<WheelSkeleton />}>
      <WheelContent
        data={data}
        history={history}
        vue={VUES.find((v) => v === vue) ?? 'roue'}
        canSpin={canSpin}
        isAdmin={profile.role === 'admin'}
      />
    </Suspense>
  )
}

async function WheelContent({
  data,
  history,
  vue,
  canSpin,
  isAdmin,
}: {
  data: Promise<WheelData>
  history: Promise<WheelHistory> | null
  vue: WheelVue
  canSpin: boolean
  isAdmin: boolean
}) {
  const [d, h] = await Promise.all([data, history])
  return <WheelTemplate data={d} history={h ?? null} vue={vue} canSpin={canSpin} isAdmin={isAdmin} />
}
