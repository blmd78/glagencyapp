import { frDateTimeLongParis } from '@glagency/core'
import { ConfigForm } from './components/config-form'
import type { RecruitConfigData } from './types'

/**
 * Template Config du test (admin) — Server Component, aucun fetch. Une seule feuille cliente : le
 * formulaire RHF (`ConfigForm`), qui écrit la ligne unique `recruit_config`.
 */
export function ConfigTemplate({ config }: { config: RecruitConfigData }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        Ce que le candidat traverse sur /postuler, et les seuils sur lesquels l’agence tranche.
        {' '}Dernière modification le {frDateTimeLongParis(config.updatedAt)}.
      </p>
      <ConfigForm config={config} />
    </div>
  )
}
