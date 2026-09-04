import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { MypulsShiftSettingsTemplate } from '@/features/mypuls-shift-settings/MypulsShiftSettingsTemplate'
import { getShiftSettings } from '@/features/mypuls-shift-settings/services/get-shift-settings'
import type { ShiftSettingsPage } from '@/features/mypuls-shift-settings/types'

/**
 * Réglages du relevé — l'écran où l'on vient quand un chiffre du relevé surprend.
 *
 * HORS SIDEBAR à dessein : c'est de la maintenance, pas du quotidien. On y arrive en cliquant
 * la ligne « Relevé MyPuls du … » qui coiffe le relevé, au moment précis où l'on se demande
 * d'où sort un chiffre.
 *
 * Ouvert à tout porteur de « presence » EN LECTURE : savoir qu'une nuit manque fait partie de
 * la lecture honnête du relevé. L'ÉCRITURE des réglages reste admin (`data.canEdit`, miroir de
 * `mypuls_shift_settings_admin_write`).
 *
 * La lecture est lancée SANS `await` : le titre s'affiche tout de suite.
 */
export default async function PresenceSettingsPage() {
  const profile = await requireAccess('presence')
  const data = getShiftSettings({ isAdmin: profile.role === 'admin' })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages du relevé</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <Settings data={data} />
      </Suspense>
    </div>
  )
}

async function Settings({ data }: { data: Promise<ShiftSettingsPage> }) {
  return <MypulsShiftSettingsTemplate data={await data} />
}
