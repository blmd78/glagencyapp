import { CoachingList } from './components/coaching-list'
import { SkillsAdmin, type SkillLine } from './components/skills-admin'
import type { CoachingRow } from './types'

/**
 * Suivi chatters — port de `/notes`. La liste et ses filtres sont clients (deux cents lignes en
 * mémoire, réponse à la frappe) ; l'agrégat qui les alimente, lui, est calculé en base.
 */
export function CoachingTemplate({
  rows,
  skills,
}: {
  rows: CoachingRow[]
  /** `null` pour un non-admin : la grille ne se gère pas depuis cet écran. */
  skills: SkillLine[] | null
}) {
  const models = [...new Set(rows.flatMap((r) => r.models))].sort((a, b) => a.localeCompare(b, 'fr'))
  return (
    <div className="wrap">
      {skills ? <SkillsAdmin skills={skills} /> : null}
      <CoachingList rows={rows} models={models} />
    </div>
  )
}
