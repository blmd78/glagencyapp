import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { CoachingTemplate } from '@/features/tracking-coaching/CoachingTemplate'
import { CoachingSkeleton } from '@/features/tracking-coaching/components/coaching-skeleton'
import { getCoachingList } from '@/features/tracking-coaching/services/get-coaching-list'
import { getSkills } from '@/features/tracking-coaching/services/get-skills'
import type { SkillLine } from '@/features/tracking-coaching/components/skills-admin'
import type { CoachingRow } from '@/features/tracking-coaching/types'

/**
 * Suivi chatters — port de `/notes` du tracker GLA.
 *
 * Ne dépend d'AUCUNE donnée du tracker : utilisable dès aujourd'hui, avant toute bascule.
 */
export default async function PresenceSuiviPage() {
  const profile = await requireAccess('presence')
  const rows = getCoachingList(profile.id, profile.baseRole)
  // La grille n'est chargée que pour un admin : inutile de la lire pour qui ne peut pas l'éditer.
  const skills = profile.role === 'admin' ? getSkills() : Promise.resolve(null)

  return (
    <div className="trk trk-page">
      <CtxBar title="Suivi chatters" crumb={<b>coaching et 1:1</b>} />
      <Suspense fallback={<CoachingSkeleton />}>
        <Body rows={rows} skills={skills} />
      </Suspense>
    </div>
  )
}

async function Body({
  rows,
  skills,
}: {
  rows: Promise<CoachingRow[]>
  skills: Promise<SkillLine[] | null>
}) {
  const [r, s] = await Promise.all([rows, skills])
  return <CoachingTemplate rows={r} skills={s} />
}
